import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { CheckCircle, Star, CreditCard, Loader2, AlertCircle } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const getErrorMessage = (error) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || d.message || JSON.stringify(d)).join(", ");
  }
  return "Error submitting request";
};

// Get URL parameters
const getUrlParameter = (name) => {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
};

export default function MembershipPage() {
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
      } catch (error) {
        setPlans([]);
      }
    };
    loadPlans();
    
    // Check if returning from Stripe
    const sessionId = getUrlParameter('session_id');
    const status = getUrlParameter('status');
    
    if (sessionId && status === 'success') {
      checkPaymentStatus(sessionId);
    } else if (status === 'cancelled') {
      toast.error("Payment was cancelled. Please try again.");
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const checkPaymentStatus = async (sessionId, attempts = 0) => {
    const maxAttempts = 5;
    const pollInterval = 2000;

    if (attempts >= maxAttempts) {
      setCheckingPayment(false);
      setPaymentStatus('timeout');
      toast.error("Payment verification timed out. Please contact support.");
      return;
    }

    setCheckingPayment(true);
    
    try {
      const res = await axios.get(`${API}/store/membership/checkout/status/${sessionId}`);
      
      if (res.data.payment_status === 'paid') {
        setCheckingPayment(false);
        setPaymentStatus('success');
        setSubmitted(true);
        toast.success("Payment successful! Welcome to your membership!");
        // Clear URL params
        window.history.replaceState({}, '', window.location.pathname);
        return;
      } else if (res.data.status === 'expired') {
        setCheckingPayment(false);
        setPaymentStatus('expired');
        toast.error("Payment session expired. Please try again.");
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
      
      // Continue polling
      setTimeout(() => checkPaymentStatus(sessionId, attempts + 1), pollInterval);
    } catch (error) {
      console.error("Error checking payment:", error);
      setTimeout(() => checkPaymentStatus(sessionId, attempts + 1), pollInterval);
    }
  };

  const handlePlanSelect = (planId) => {
    const plan = plans.find(p => p.id === planId);
    setSelectedPlan(plan);
    setForm({ ...form, membership_plan: plan?.name || "" });
  };

  const buildPreferencesPayload = () => {
    if (!isElitePlan) {
      return null;
    }
    const payload = {
      detergent_type: form.detergent_type,
      water_temperature: form.water_temperature,
      fabric_softener: form.fabric_softener,
      folding_style: form.folding_style,
      hanging_instructions: form.hanging_instructions,
      allergies: form.allergies,
      special_instructions: form.special_instructions,
      pickup_time_preference: form.pickup_time_preference,
      gate_code: form.gate_code
    };
    const hasValues = Object.values(payload).some((value) => (value || "").toString().trim());
    return hasValues ? payload : null;
  };

  const handlePayNow = async () => {
    if (!selectedPlan) {
      toast.error("Please select a membership plan");
      return;
    }
    if (!form.email) {
      toast.error("Please enter your email address");
      return;
    }
    if (!form.first_name || !form.last_name) {
      toast.error("Please enter your name");
      return;
    }

    setSubmitting(true);
    try {
      const preferences = buildPreferencesPayload();
      const res = await axios.post(`${API}/store/membership/checkout`, {
        plan_id: selectedPlan.id,
        origin_url: window.location.origin,
        customer_email: form.email.trim(),
        customer_name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
        customer_phone: form.phone.trim(),
        preferences
      });
      
      // Redirect to Stripe checkout
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.contact_method || !form.membership_plan || !form.laundry_frequency) {
      toast.error("Please complete all required fields");
      return;
    }
    setSubmitting(true);
    try {
      const preferences = buildPreferencesPayload();
      const res = await axios.post(`${API}/public/membership-signup`, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        contact_method: form.contact_method,
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2 ? form.address_line2.trim() : null,
        city: form.city.trim(),
        state: form.state.trim(),
        zip_code: form.zip_code.trim(),
        membership_plan: form.membership_plan,
        laundry_frequency: form.laundry_frequency,
        estimated_lbs: parseFloat(form.estimated_lbs),
        detergent_type: preferences?.detergent_type || null,
        water_temperature: preferences?.water_temperature || null,
        fabric_softener: preferences?.fabric_softener || null,
        folding_style: preferences?.folding_style || null,
        hanging_instructions: preferences?.hanging_instructions || null,
        allergies: preferences?.allergies || null,
        special_instructions: preferences?.special_instructions || null,
        pickup_time_preference: preferences?.pickup_time_preference || null,
        gate_code: preferences?.gate_code || null
      });
      toast.success(res.data.message);
      setSubmitted(true);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  // Payment checking screen
  if (checkingPayment) {
    return (
      <div className="min-h-screen bg-white">
        <PublicNav />
       <section className="pt-24 pb-8 bg-gradient-to-b from-sky-50 to-white">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="h-20 w-20 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-6">
              <Loader2 className="h-10 w-10 text-sky-600 animate-spin" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-4">Verifying Payment...</h1>
            <p className="text-lg text-slate-600 mb-8">
              Please wait while we confirm your payment.
            </p>
          </div>
        </section>
        <PublicFooter />
      </div>
    );
  }

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
              {paymentStatus === 'success' ? 'Payment Successful!' : 'Request Received'}
            </h1>
            <p className="text-lg text-slate-600 mb-8">
              {paymentStatus === 'success' 
                ? 'Welcome to your membership! Our team will contact you to schedule your first pickup.'
                : 'Our team will contact you to confirm your plan and schedule your first pickup.'
              }
            </p>
            <Button 
              onClick={() => {
                setSubmitted(false);
                setPaymentStatus(null);
                setSelectedPlan(null);
                setForm({
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
                  membership_plan: "",
                  laundry_frequency: "",
                  estimated_lbs: ""
                });
              }}
              className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8"
            >
              Register another membership
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

      <section className="pt-24 pb-8 bg-gradient-to-b from-sky-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="h-16 w-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-6">
            <Star className="h-8 w-8 text-sky-600" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
            Laundry memberships designed for your lifestyle
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            Choose the membership that fits your lifestyle. Enjoy hassle-free laundry with scheduled pickup & delivery, personalized preferences, and professional care every month.
          </p>
        </div>
      </section>

      {/* Membership Plans Cards */}
      <section className="py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">Choose Your Plan</h2>
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {plans.map((plan) => (
              <div 
                key={plan.id}
                data-testid={`membership-plan-${plan.id}`}
                className={`relative bg-white rounded-2xl border-2 transition-all cursor-pointer ${
                  selectedPlan?.id === plan.id 
                    ? 'border-sky-500 shadow-lg shadow-sky-100' 
                    : 'border-slate-200 hover:border-sky-300'
                }`}
                onClick={() => handlePlanSelect(plan.id)}
              >
                {plan.is_popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-sky-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      MOST POPULAR
                    </span>
                  </div>
                )}
                <div className="p-6">
                  {plan.image_url && (
                    <img 
                      src={plan.image_url} 
                      alt={plan.name} 
                      className="w-full h-32 object-contain mb-4"
                    />
                  )}
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{plan.name}</h3>
                  <p className="text-3xl font-bold text-sky-600 mb-4">{plan.price}</p>
                  <ul className="space-y-2 mb-6">
                    {plan.features?.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className={`w-full h-1 rounded-full ${
                    selectedPlan?.id === plan.id ? 'bg-sky-500' : 'bg-slate-200'
                  }`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Complete Your Membership</h2>
              <p className="text-slate-600">
                Fill out your details below and proceed to secure payment.
              </p>
              {selectedPlan && (
                <div className="mt-4 p-4 bg-sky-50 rounded-lg border border-sky-200">
                  <p className="text-sm text-sky-800">
                    Selected Plan: <strong>{selectedPlan.name}</strong> - <strong>{selectedPlan.price}</strong>
                  </p>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label className="text-slate-700">Name *</Label>
                <div className="grid md:grid-cols-2 gap-4 mt-1">
                  <Input
                    placeholder="First Name"
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    required
                    data-testid="membership-first-name"
                  />
                  <Input
                    placeholder="Last Name"
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    required
                    data-testid="membership-last-name"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-700">Email *</Label>
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
                  <Label className="text-slate-700">Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1"
                    data-testid="membership-phone"
                  />
                </div>
              </div>

              <div>
                <Label className="text-slate-700">Best way to contact you</Label>
                <Select value={form.contact_method} onValueChange={(value) => setForm({ ...form, contact_method: value })}>
                  <SelectTrigger className="mt-1" data-testid="membership-contact-method">
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-slate-700">Address</Label>
                <div className="space-y-4 mt-1">
                  <Input
                    placeholder="Address Line 1"
                    value={form.address_line1}
                    onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
                    data-testid="membership-address-line1"
                  />
                  <Input
                    placeholder="Address Line 2"
                    value={form.address_line2}
                    onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
                    data-testid="membership-address-line2"
                  />
                  <div className="grid md:grid-cols-3 gap-4">
                    <Input
                      placeholder="City"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      data-testid="membership-city"
                    />
                    <Input
                      placeholder="State"
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      data-testid="membership-state"
                    />
                    <Input
                      placeholder="ZIP Code"
                      value={form.zip_code}
                      onChange={(e) => setForm({ ...form, zip_code: e.target.value })}
                      data-testid="membership-zip"
                    />
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-700">Membership Plan *</Label>
                      value={selectedPlan?.id || ""} 
                    onValueChange={(value) => handlePlanSelect(value)}
                                                                 >
                    <SelectTrigger className="mt-1" data-testid="membership-plan-select">
                      <SelectValue placeholder="Select a plan" />
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
                  <Label className="text-slate-700">Expected laundry frequency</Label>
                  <Select value={form.laundry_frequency} onValueChange={(value) => setForm({ ...form, laundry_frequency: value })}>
                    <SelectTrigger className="mt-1" data-testid="membership-frequency">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Biweekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-slate-700">Estimated weight per pickup (Lbs)</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.estimated_lbs}
                  onChange={(e) => setForm({ ...form, estimated_lbs: e.target.value })}
                  className="mt-1"
                  placeholder="e.g., 20"
                  data-testid="membership-estimated-lbs"
                />
              </div>

              {isElitePlan && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4" data-testid="elite-preferences-section">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Preferencias Elite Concierge</h3>
                    <p className="text-sm text-slate-600">Configura tus preferencias para personalizar el servicio.</p>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-700">Detergente preferido</Label>
                      <Select value={form.detergent_type} onValueChange={(value) => setForm({ ...form, detergent_type: value })}>
                        <SelectTrigger className="mt-1" data-testid="elite-detergent">
                          <SelectValue placeholder="Selecciona detergente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hypoallergenic">Hipoalergénico</SelectItem>
                          <SelectItem value="free_clear">Sin fragancia</SelectItem>
                          <SelectItem value="lavender">Lavanda</SelectItem>
                          <SelectItem value="standard">Estándar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-700">Temperatura de lavado</Label>
                      <Select value={form.water_temperature} onValueChange={(value) => setForm({ ...form, water_temperature: value })}>
                        <SelectTrigger className="mt-1" data-testid="elite-water-temperature">
                          <SelectValue placeholder="Selecciona temperatura" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cold">Fría</SelectItem>
                          <SelectItem value="warm">Tibia</SelectItem>
                          <SelectItem value="hot">Caliente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-700">Suavizante</Label>
                      <Select value={form.fabric_softener} onValueChange={(value) => setForm({ ...form, fabric_softener: value })}>
                        <SelectTrigger className="mt-1" data-testid="elite-fabric-softener">
                          <SelectValue placeholder="Selecciona suavizante" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin suavizante</SelectItem>
                          <SelectItem value="light">Ligero</SelectItem>
                          <SelectItem value="standard">Estándar</SelectItem>
                          <SelectItem value="extra">Extra</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-700">Estilo de doblado</Label>
                      <Select value={form.folding_style} onValueChange={(value) => setForm({ ...form, folding_style: value })}>
                        <SelectTrigger className="mt-1" data-testid="elite-folding-style">
                          <SelectValue placeholder="Selecciona estilo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Estándar</SelectItem>
                          <SelectItem value="konmari">KonMari</SelectItem>
                          <SelectItem value="stacked">Apilado premium</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-slate-700">Colgado / prendas especiales</Label>
                      <Input
                        value={form.hanging_instructions}
                        onChange={(e) => setForm({ ...form, hanging_instructions: e.target.value })}
                        className="mt-1"
                        placeholder="Ej. Camisas en gancho, vestidos separados"
                        data-testid="elite-hanging-instructions"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-slate-700">Alergias o sensibilidades</Label>
                      <Textarea
                        value={form.allergies}
                        onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                        className="mt-1"
                        placeholder="Ej. Sin fragancias, piel sensible"
                        data-testid="elite-allergies"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-slate-700">Notas adicionales</Label>
                      <Textarea
                        value={form.special_instructions}
                        onChange={(e) => setForm({ ...form, special_instructions: e.target.value })}
                        className="mt-1"
                        placeholder="Instrucciones especiales para el servicio"
                        data-testid="elite-special-instructions"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700">Horario preferido de pickup</Label>
                      <Input
                        value={form.pickup_time_preference}
                        onChange={(e) => setForm({ ...form, pickup_time_preference: e.target.value })}
                        className="mt-1"
                        placeholder="Ej. 8am - 12pm"
                        data-testid="elite-pickup-time"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-700">Puerta / Código de acceso</Label>
                      <Input
                        value={form.gate_code}
                        onChange={(e) => setForm({ ...form, gate_code: e.target.value })}
                        className="mt-1"
                        placeholder="Ej. 1234#"
                        data-testid="elite-gate-code"
                      />
                    </div>
                  </div>
                </div>
              )}

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
                  {submitting ? "Processing..." : `Pay Now ${selectedPlan ? selectedPlan.price : ''}`}
                </Button>
                <p className="text-center text-xs text-slate-500">
                  Secure payment powered by Stripe. Your card details are never stored on our servers.
                </p>
              </div>
            </form>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
