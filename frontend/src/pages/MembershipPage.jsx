import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { CheckCircle, Star, CreditCard, Loader2 } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import SmsConsentField from "../components/SmsConsentField";
import AddressAutocomplete from "../components/AddressAutocomplete";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const getErrorMessage = (error) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || d.message || JSON.stringify(d)).join(", ");
  }
  return "Error submitting request";
};

const getUrlParameter = (name) => {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
};

export default function MembershipPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    contact_method: "",
    sms_consent: false,
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    zip_code: "",
    membership_plan: "",
    laundry_frequency: "",
    estimated_lbs: "",
    detergent_type: "",
    water_temperature: "",
    fabric_softener: "",
    folding_style: "",
    hanging_instructions: "",
    allergies: "",
    special_instructions: "",
    pickup_time_preference: "",
    gate_code: ""
  });
  const isElitePlan = selectedPlan?.name?.toLowerCase().includes("elite concierge");

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const res = await axios.get(`${API}/public/membership-plans`);
        setPlans(res.data || []);
      } catch {
        setPlans([]);
      }
    };
    loadPlans();

    const sessionId = getUrlParameter("session_id");
    const status = getUrlParameter("status");

    if (sessionId && status === "success") {
      checkPaymentAndRegister(sessionId);
    } else if (status === "cancelled") {
      toast.error(t("Payment was cancelled. Please try again.", "El pago fue cancelado. Por favor, inténtalo de nuevo."));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * After returning from Stripe, poll until payment is confirmed,
   * then call complete-registration to create the account + membership.
   */
  const checkPaymentAndRegister = async (sessionId, attempts = 0) => {
    const maxAttempts = 8;
    const pollInterval = 2500;

    if (attempts >= maxAttempts) {
      setCheckingPayment(false);
      setPaymentStatus("timeout");
      toast.error(
        t(
          "Payment verification timed out. Please contact support.",
          "La verificación del pago expiró. Por favor contacta a soporte."
        )
      );
      return;
    }

    setCheckingPayment(true);

    try {
      const res = await axios.get(`${API}/store/membership/checkout/status/${sessionId}`);

      if (res.data.payment_status === "paid") {
        // Payment confirmed → complete registration
        try {
          const regRes = await axios.post(
            `${API}/store/membership/complete-registration/${sessionId}`
          );

          if (regRes.data.access_token) {
            localStorage.setItem("customer_token", regRes.data.access_token);
            localStorage.setItem(
              "customer_data",
              JSON.stringify(regRes.data.customer)
            );
            toast.success(
              t(
                "Welcome! Your account and membership are ready.",
                "¡Bienvenido! Tu cuenta y membresía están listas."
              )
            );
            window.history.replaceState({}, "", window.location.pathname);
            navigate("/account");
          } else {
            // Registration returned no token — still show success screen
            setCheckingPayment(false);
            setPaymentStatus("success");
            setSubmitted(true);
            window.history.replaceState({}, "", window.location.pathname);
          }
        } catch (regErr) {
          // Account creation failed but payment went through
          console.error("Registration error after payment:", regErr);
          toast.warning(
            t(
              "Payment successful! We'll set up your account shortly and email you.",
              "¡Pago exitoso! Configuraremos tu cuenta pronto y te enviaremos un correo."
            )
          );
          setCheckingPayment(false);
          setPaymentStatus("success");
          setSubmitted(true);
          window.history.replaceState({}, "", window.location.pathname);
        }
        return;
      }

      if (res.data.status === "expired") {
        setCheckingPayment(false);
        setPaymentStatus("expired");
        toast.error(
          t(
            "Payment session expired. Please try again.",
            "La sesión de pago expiró. Por favor, inténtalo de nuevo."
          )
        );
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      setTimeout(() => checkPaymentAndRegister(sessionId, attempts + 1), pollInterval);
    } catch (error) {
      console.error("Error checking payment:", error);
      setTimeout(() => checkPaymentAndRegister(sessionId, attempts + 1), pollInterval);
    }
  };

  const handlePlanSelect = (planId) => {
    const plan = plans.find((p) => p.id === planId);
    setSelectedPlan(plan);
    setForm({ ...form, membership_plan: plan?.name || "" });
  };

  const buildPreferencesPayload = () => {
    if (!isElitePlan) return null;
    const payload = {
      detergent_type: form.detergent_type,
      water_temperature: form.water_temperature,
      fabric_softener: form.fabric_softener,
      folding_style: form.folding_style,
      hanging_instructions: form.hanging_instructions,
      allergies: form.allergies,
      special_instructions: form.special_instructions,
      pickup_time_preference: form.pickup_time_preference,
      gate_code: form.gate_code,
    };
    const hasValues = Object.values(payload).some((v) =>
      (v || "").toString().trim()
    );
    return hasValues ? payload : null;
  };

  const handlePayNow = async () => {
    if (!selectedPlan) {
      toast.error(
        t("Please select a membership plan", "Por favor selecciona un plan de membresía")
      );
      return;
    }
    if (!form.email) {
      toast.error(
        t("Please enter your email address", "Por favor ingresa tu correo electrónico")
      );
      return;
    }
    if (!form.first_name || !form.last_name) {
      toast.error(t("Please enter your name", "Por favor ingresa tu nombre"));
      return;
    }
    if (!form.laundry_frequency) {
      toast.error(
        t(
          "Please select your laundry frequency",
          "Por favor selecciona la frecuencia de lavandería"
        )
      );
      return;
    }
    if (
      ["text", "sms", "whatsapp"].includes(form.contact_method) &&
      !form.sms_consent
    ) {
      toast.error(
        t(
          "You must accept SMS consent to receive text notifications.",
          "Debes aceptar el consentimiento SMS para recibir notificaciones por mensaje."
        )
      );
      return;
    }

    setSubmitting(true);
    try {
      const preferences = buildPreferencesPayload();

      // Send ALL form data so the backend can complete registration after payment
      const res = await axios.post(`${API}/store/membership/checkout`, {
        plan_id: selectedPlan.id,
        origin_url: window.location.origin,
        // Customer identity
        customer_email: form.email.trim(),
        customer_name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
        customer_phone: form.phone.trim(),
        // Full registration data (stored by backend until payment confirmed)
        registration_data: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          contact_method: form.contact_method,
          sms_consent: form.sms_consent,
          address_line1: form.address_line1.trim(),
          address_line2: form.address_line2 ? form.address_line2.trim() : null,
          city: form.city.trim(),
          state: form.state.trim(),
          zip_code: form.zip_code.trim(),
          membership_plan: form.membership_plan,
          laundry_frequency: form.laundry_frequency,
          estimated_lbs: form.estimated_lbs ? parseFloat(form.estimated_lbs) : null,
        },
        preferences,
      });

      if (res.data.checkout_url) {
        window.location.href = res.data.checkout_url;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
      setSubmitting(false);
    }
  };

  // ── Payment verifying screen ──────────────────────────────────────────────
  if (checkingPayment) {
    return (
      <div className="min-h-screen bg-white">
        <PublicNav />
        <section className="pt-24 pb-8 bg-gradient-to-b from-sky-50 to-white">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="h-20 w-20 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-6">
              <Loader2 className="h-10 w-10 text-sky-600 animate-spin" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-4">
              {t("Setting up your account…", "Configurando tu cuenta…")}
            </h1>
            <p className="text-lg text-slate-600 mb-8">
              {t(
                "Please wait while we confirm your payment and create your membership.",
                "Por favor espera mientras confirmamos tu pago y creamos tu membresía."
              )}
            </p>
          </div>
        </section>
        <PublicFooter />
      </div>
    );
  }

  // ── Success screen (fallback if redirect failed) ───────────────────────────
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
              {t("Payment Successful!", "¡Pago exitoso!")}
            </h1>
            <p className="text-lg text-slate-600 mb-8">
              {t(
                "Welcome to your membership! Check your email — we sent your login credentials. You can now access your account.",
                "¡Bienvenido a tu membresía! Revisa tu correo — te enviamos tus credenciales de acceso. Ya puedes ingresar a tu cuenta."
              )}
            </p>
            <Button
              onClick={() => navigate("/account")}
              className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8"
            >
              {t("Go to my account", "Ir a mi cuenta")}
            </Button>
          </div>
        </section>
        <PublicFooter />
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      <section className="pt-32 pb-8 bg-gradient-to-b from-sky-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="h-16 w-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-6">
            <Star className="h-8 w-8 text-sky-600" />
          </div>
          <h1
            className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {t(
              "Laundry memberships designed for your lifestyle",
              "Membresías de lavandería diseñadas para tu estilo de vida"
            )}
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            {t(
              "Choose the membership that fits your lifestyle. Enjoy hassle-free laundry with scheduled pickup & delivery, personalized preferences, and professional care every month.",
              "Elige la membresía que se adapte a tu estilo de vida. Disfruta de lavandería sin complicaciones con recogida y entrega programada, preferencias personalizadas y cuidado profesional cada mes."
            )}
          </p>
        </div>
      </section>

      {/* Membership Plan Cards */}
      <section className="py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">
            {t("Choose Your Plan", "Elige tu plan")}
          </h2>
          <div className="flex flex-wrap justify-center gap-6 mb-10">
            {plans.map((plan) => (
              <div
                key={plan.id}
                data-testid={`membership-plan-${plan.id}`}
                className={`relative bg-white rounded-2xl border-2 transition-all cursor-pointer w-full sm:w-[350px] overflow-hidden ${
                  selectedPlan?.id === plan.id
                    ? "border-sky-500 shadow-xl shadow-sky-100"
                    : "border-slate-200 hover:border-sky-300 hover:shadow-lg"
                }`}
                onClick={() => handlePlanSelect(plan.id)}
              >
                {plan.is_popular && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
                    <span className="bg-sky-500 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow-md whitespace-nowrap">
                      {t("MOST POPULAR", "MÁS POPULAR")}
                    </span>
                  </div>
                )}
                <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-sky-100 to-sky-200">
                  {plan.image_url && (
                    <img
                      src={plan.image_url}
                      alt={plan.name}
                      className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 hover:scale-105"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-white via-white/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 px-5 pb-3">
                    <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  </div>
                </div>
                <div className="px-5 pb-6 pt-1">
                  <p className="text-3xl font-bold text-sky-600 mb-4">{plan.price}</p>
                  <ul className="space-y-2 mb-6">
                    {plan.features?.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div
                    className={`w-full h-1 rounded-full transition-colors ${
                      selectedPlan?.id === plan.id ? "bg-sky-500" : "bg-slate-200"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                {t("Complete Your Membership", "Completa tu membresía")}
              </h2>
              <p className="text-slate-600">
                {t(
                  "Fill out your details below and proceed to secure payment. We'll create your account automatically after payment.",
                  "Completa tus datos a continuación y procede al pago seguro. Crearemos tu cuenta automáticamente después del pago."
                )}
              </p>
              {selectedPlan && (
                <div className="mt-4 p-4 bg-sky-50 rounded-lg border border-sky-200">
                  <p className="text-sm text-sky-800">
                    {t("Selected Plan:", "Plan seleccionado:")}{" "}
                    <strong>{selectedPlan.name}</strong> -{" "}
                    <strong>{selectedPlan.price}</strong>
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {/* Name */}
              <div>
                <Label className="text-slate-700">{t("Name *", "Nombre *")}</Label>
                <div className="grid md:grid-cols-2 gap-4 mt-1">
                  <Input
                    placeholder={t("First Name", "Nombre")}
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    required
                    data-testid="membership-first-name"
                  />
                  <Input
                    placeholder={t("Last Name", "Apellido")}
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    required
                    data-testid="membership-last-name"
                  />
                </div>
              </div>

              {/* Email + Phone */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-700">{t("Email *", "Correo *")}</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="mt-1"
                    data-testid="membership-email"
                  />
                </div>
                <div>
                  <Label className="text-slate-700">{t("Phone", "Teléfono")}</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1"
                    data-testid="membership-phone"
                  />
                </div>
              </div>

              {/* Contact method */}
              <div>
                <Label className="text-slate-700">
                  {t("Best way to contact you", "Mejor forma de contactarte")}
                </Label>
                <Select
                  value={form.contact_method}
                  onValueChange={(value) => setForm({ ...form, contact_method: value })}
                >
                  <SelectTrigger className="mt-1" data-testid="membership-contact-method">
                    <SelectValue placeholder={t("Select an option", "Selecciona una opción")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">{t("Phone", "Teléfono")}</SelectItem>
                    <SelectItem value="text">{t("Text", "Mensaje")}</SelectItem>
                    <SelectItem value="email">{t("Email", "Correo")}</SelectItem>
                  </SelectContent>
                </Select>
                <SmsConsentField
                  checked={form.sms_consent}
                  onChange={(e) => setForm({ ...form, sms_consent: e.target.checked })}
                  idPrefix="membership-sms-consent"
                />
              </div>

              {/* Address */}
              <div>
                <Label className="text-slate-700">{t("Address", "Dirección")}</Label>
                <div className="space-y-4 mt-1">
                  <AddressAutocomplete
                    value={form.address_line1}
                    onChange={(v) => setForm({ ...form, address_line1: v })}
                    onSelect={(addr) => {
                      setForm((prev) => ({
                        ...prev,
                        address_line1: addr.street,
                        ...(addr.city && { city: addr.city }),
                        ...(addr.state && { state: addr.state }),
                        ...(addr.zip && { zip_code: addr.zip }),
                      }));
                    }}
                    placeholder={t("Address Line 1", "Dirección línea 1")}
                    inputClassName="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    inputProps={{ "data-testid": "membership-address-line1" }}
                  />
                  <Input
                    placeholder={t("Address Line 2", "Dirección línea 2")}
                    value={form.address_line2}
                    onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
                    data-testid="membership-address-line2"
                  />
                  <div className="grid md:grid-cols-3 gap-4">
                    <Input
                      placeholder={t("City", "Ciudad")}
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      data-testid="membership-city"
                    />
                    <Input
                      placeholder={t("State", "Estado")}
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      data-testid="membership-state"
                    />
                    <Input
                      placeholder={t("ZIP Code", "Código postal")}
                      value={form.zip_code}
                      onChange={(e) => setForm({ ...form, zip_code: e.target.value })}
                      data-testid="membership-zip"
                    />
                  </div>
                </div>
              </div>

              {/* Plan + Frequency */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-700">
                    {t("Membership Plan *", "Plan de membresía *")}
                  </Label>
                  <Select
                    value={selectedPlan?.id || ""}
                    onValueChange={(value) => handlePlanSelect(value)}
                  >
                    <SelectTrigger className="mt-1" data-testid="membership-plan-select">
                      <SelectValue placeholder={t("Select a plan", "Selecciona un plan")} />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} - {plan.price}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-700">
                    {t("Expected laundry frequency", "Frecuencia esperada de lavandería")}
                  </Label>
                  <Select
                    value={form.laundry_frequency}
                    onValueChange={(value) => setForm({ ...form, laundry_frequency: value })}
                  >
                    <SelectTrigger className="mt-1" data-testid="membership-frequency">
                      <SelectValue placeholder={t("Select an option", "Selecciona una opción")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">{t("Weekly", "Semanal")}</SelectItem>
                      <SelectItem value="biweekly">{t("Biweekly", "Quincenal")}</SelectItem>
                      <SelectItem value="twiceaweek">{t("Twice a week", "dos veces por semana")}</SelectItem>
                      <SelectItem value="monthly">{t("Monthly", "Mensual")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Estimated weight */}
              <div>
                <Label className="text-slate-700">
                  {t("Estimated weight per pickup (Lbs)", "Peso estimado por recogida (Libras)")}
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={form.estimated_lbs}
                  onChange={(e) => setForm({ ...form, estimated_lbs: e.target.value })}
                  className="mt-1"
                  placeholder={t("e.g., 20", "ej. 20")}
                  data-testid="membership-estimated-lbs"
                />
              </div>

              {/* Elite Concierge preferences */}
              {isElitePlan && (
                <div
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4"
                  data-testid="elite-preferences-section"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {t("Elite Concierge Preferences", "Preferencias Elite Concierge")}
                    </h3>
                    <p className="text-sm text-slate-600">
                      {t(
                        "Set your preferences to personalize the service.",
                        "Configura tus preferencias para personalizar el servicio."
                      )}
                    </p>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-700">
                        {t("Preferred detergent", "Detergente preferido")}
                      </Label>
                      <Select
                        value={form.detergent_type}
                        onValueChange={(v) => setForm({ ...form, detergent_type: v })}
                      >
                        <SelectTrigger className="mt-1" data-testid="elite-detergent">
                          <SelectValue placeholder={t("Select detergent", "Selecciona detergente")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hypoallergenic">
                            {t("Hypoallergenic", "Hipoalergénico")}
                          </SelectItem>
                          <SelectItem value="free_clear">{t("Free & Clear", "Sin fragancia")}</SelectItem>
                          <SelectItem value="lavender">{t("Lavender", "Lavanda")}</SelectItem>
                          <SelectItem value="standard">{t("Standard", "Estándar")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-700">
                        {t("Water temperature", "Temperatura de lavado")}
                      </Label>
                      <Select
                        value={form.water_temperature}
                        onValueChange={(v) => setForm({ ...form, water_temperature: v })}
                      >
                        <SelectTrigger className="mt-1" data-testid="elite-water-temperature">
                          <SelectValue
                            placeholder={t("Select temperature", "Selecciona temperatura")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cold">{t("Cold", "Fría")}</SelectItem>
                          <SelectItem value="warm">{t("Warm", "Tibia")}</SelectItem>
                          <SelectItem value="hot">{t("Hot", "Caliente")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-700">{t("Fabric softener", "Suavizante")}</Label>
                      <Select
                        value={form.fabric_softener}
                        onValueChange={(v) => setForm({ ...form, fabric_softener: v })}
                      >
                        <SelectTrigger className="mt-1" data-testid="elite-fabric-softener">
                          <SelectValue placeholder={t("Select softener", "Selecciona suavizante")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("None", "Sin suavizante")}</SelectItem>
                          <SelectItem value="light">{t("Light", "Ligero")}</SelectItem>
                          <SelectItem value="standard">{t("Standard", "Estándar")}</SelectItem>
                          <SelectItem value="extra">{t("Extra", "Extra")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-700">{t("Folding style", "Estilo de doblado")}</Label>
                      <Select
                        value={form.folding_style}
                        onValueChange={(v) => setForm({ ...form, folding_style: v })}
                      >
                        <SelectTrigger className="mt-1" data-testid="elite-folding-style">
                          <SelectValue placeholder={t("Select style", "Selecciona estilo")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">{t("Standard", "Estándar")}</SelectItem>
                          <SelectItem value="konmari">{t("KonMari", "KonMari")}</SelectItem>
                          <SelectItem value="stacked">{t("Premium stacked", "Apilado premium")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-slate-700">
                        {t("Hanging / special items", "Colgado / prendas especiales")}
                      </Label>
                      <Input
                        value={form.hanging_instructions}
                        onChange={(e) => setForm({ ...form, hanging_instructions: e.target.value })}
                        className="mt-1"
                        placeholder={t(
                          "e.g. Shirts on hangers, dresses separate",
                          "Ej. Camisas en gancho, vestidos separados"
                        )}
                        data-testid="elite-hanging-instructions"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-slate-700">
                        {t("Allergies or sensitivities", "Alergias o sensibilidades")}
                      </Label>
                      <Textarea
                        value={form.allergies}
                        onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                        className="mt-1"
                        placeholder={t(
                          "e.g. No fragrances, sensitive skin",
                          "Ej. Sin fragancias, piel sensible"
                        )}
                        data-testid="elite-allergies"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-slate-700">
                        {t("Additional notes", "Notas adicionales")}
                      </Label>
                      <Textarea
                        value={form.special_instructions}
                        onChange={(e) =>
                          setForm({ ...form, special_instructions: e.target.value })
                        }
                        className="mt-1"
                        placeholder={t(
                          "Special instructions for the service",
                          "Instrucciones especiales para el servicio"
                        )}
                        data-testid="elite-special-instructions"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700">
                        {t("Preferred pickup time", "Horario preferido de pickup")}
                      </Label>
                      <Input
                        value={form.pickup_time_preference}
                        onChange={(e) =>
                          setForm({ ...form, pickup_time_preference: e.target.value })
                        }
                        className="mt-1"
                        placeholder={t("e.g. 8am - 12pm", "Ej. 8am - 12pm")}
                        data-testid="elite-pickup-time"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700">
                        {t("Gate / Access code", "Puerta / Código de acceso")}
                      </Label>
                      <Input
                        value={form.gate_code}
                        onChange={(e) => setForm({ ...form, gate_code: e.target.value })}
                        className="mt-1"
                        placeholder={t("e.g. 1234#", "Ej. 1234#")}
                        data-testid="elite-gate-code"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Single CTA: Pay Now ── */}
              <div className="pt-4 space-y-3">
                <Button
                  type="button"
                  onClick={handlePayNow}
                  className="w-full bg-green-600 hover:bg-green-700 text-white rounded-full h-12 text-lg"
                  disabled={submitting || !selectedPlan}
                  data-testid="membership-pay-now"
                >
                  {submitting ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <CreditCard className="h-5 w-5 mr-2" />
                  )}
                  {submitting
                    ? t("Processing...", "Procesando...")
                    : `${t("Pay Now", "Pagar ahora")} ${selectedPlan ? selectedPlan.price : ""}`}
                </Button>

                <p className="text-center text-xs text-slate-500">
                  {t(
                    "After payment, your account and membership will be created automatically and you'll receive your login details by email.",
                    "Después del pago, tu cuenta y membresía se crearán automáticamente y recibirás tus datos de acceso por correo."
                  )}
                </p>
                <p className="text-center text-xs text-slate-400">
                  {t(
                    "Secure payment powered by Stripe. Your card details are never stored on our servers.",
                    "Pago seguro con Stripe. Los detalles de tu tarjeta nunca se almacenan en nuestros servidores."
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}