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
    estimated_lbs: ""
  });

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
      const res = await axios.post(`${API}/store/membership/checkout`, {
        plan_id: selectedPlan.id,
        origin_url: window.location.origin,
        customer_email: form.email,
        customer_name: `${form.first_name} ${form.last_name}`,
        customer_phone: form.phone
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
      const res = await axios.post(`${API}/public/membership-signup`, {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        contact_method: form.contact_method,
        address_line1: form.address_line1,
        address_line2: form.address_line2 || null,
        city: form.city,
        state: form.state,
        zip_code: form.zip_code,
        membership_plan: form.membership_plan,
        laundry_frequency: form.laundry_frequency,
        estimated_lbs: parseFloat(form.estimated_lbs)
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
        <section className="pt-32 pb-20">
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

      <section className="py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Laundry, handled for you every month</h2>
              <p className="text-slate-600">
                Fill out the form below to get started. Our team will contact you to confirm your plan and schedule your first pickup.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label className="text-slate-700">Name</Label>
                <div className="grid md:grid-cols-2 gap-4 mt-1">
                  <Input
                    placeholder="First Name"
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    required
                  />
                  <Input
                    placeholder="Last Name"
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-700">Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-700">Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-slate-700">Best way to contact you</Label>
                <Select value={form.contact_method} onValueChange={(value) => setForm({ ...form, contact_method: value })}>
                  <SelectTrigger className="mt-1">
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
                    required
                  />
                  <Input
                    placeholder="Address Line 2"
                    value={form.address_line2}
                    onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
                  />
                  <div className="grid md:grid-cols-3 gap-4">
                    <Input
                      placeholder="City"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      required
                    />
                    <Input
                      placeholder="State"
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      required
                    />
                    <Input
                      placeholder="ZIP Code"
                      value={form.zip_code}
                      onChange={(e) => setForm({ ...form, zip_code: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-700">Select your membership plan</Label>
                  <Select value={form.membership_plan} onValueChange={(value) => setForm({ ...form, membership_plan: value })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.name}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-700">Expected laundry frequency</Label>
                  <Select value={form.laundry_frequency} onValueChange={(value) => setForm({ ...form, laundry_frequency: value })}>
                    <SelectTrigger className="mt-1">
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
                <Label className="text-slate-700">Estimated weight (Lbs)</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.estimated_lbs}
                  onChange={(e) => setForm({ ...form, estimated_lbs: e.target.value })}
                  required
                  className="mt-1"
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full bg-sky-500 hover:bg-sky-600 text-white rounded-full h-12 text-lg"
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "SUBMIT"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
