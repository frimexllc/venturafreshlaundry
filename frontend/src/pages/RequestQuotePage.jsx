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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BUSINESS_TYPES = [
  { value: "hotel", label: "Hotel / Hospitality" },
  { value: "airbnb", label: "Airbnb / Vacation Rental" },
  { value: "restaurant", label: "Restaurant / Food Service" },
  { value: "healthcare", label: "Healthcare / Medical" },
  { value: "fitness", label: "Gym / Fitness Center" },
  { value: "spa", label: "Spa / Salon" },
  { value: "property_management", label: "Property Management" },
  { value: "corporate", label: "Corporate Office" },
  { value: "manufacturing", label: "Manufacturing / Industrial" },
  { value: "retail", label: "Retail" },
  { value: "other", label: "Other" }
];

const SERVICE_TYPES = [
  { value: "wash_fold", label: "Wash & Fold" },
  { value: "dry_cleaning", label: "Dry Cleaning" },
  { value: "linens", label: "Linens & Towels" },
  { value: "uniforms", label: "Uniforms" },
  { value: "full_service", label: "Full Service (All of the above)" }
];

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "twice_week", label: "Twice a Week" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "on_demand", label: "On Demand" }
];

const CONTACT_METHODS = [
  { value: "phone", label: "Phone Call" },
  { value: "text", label: "Text Message" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" }
];

export default function RequestQuotePage() {
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
      toast.error("Please fill all required fields");
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
      toast.success(res.data.message || "Quote request submitted successfully!");
      setSubmitted(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error submitting request");
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
            <h1 className="text-3xl font-bold text-slate-900 mb-4">Quote Request Received!</h1>
            <p className="text-lg text-slate-600 mb-8">
              Thank you for your interest in our commercial laundry services. Our team will review your requirements and contact you within 24-48 hours with a customized quote.
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
              Submit Another Request
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

      {/* Hero Section */}
      <section className="pt-24 pb-8 bg-gradient-to-b from-slate-900 to-slate-800">
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
            Commercial Laundry Services
          </h1>
          <p className="text-xl text-slate-300 max-w-3xl mx-auto mb-4">
            Reliable commercial laundry services for growing businesses
          </p>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Streamline your operations with reliable commercial laundry service. Provide your information below and our team will contact you to prepare a customized quote based on your volume, service requirements, and logistics needs.
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
                Contact Information
              </h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>First Name *</Label>
                  <Input
                    value={form.first_name}
                    onChange={(e) => setForm({...form, first_name: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Last Name *</Label>
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
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({...form, email: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Phone *</Label>
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
                  <Label>Best way to contact you</Label>
                  <Select value={form.contact_method} onValueChange={(v) => setForm({...form, contact_method: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_METHODS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Job Title / Role</Label>
                  <Input
                    value={form.job_title}
                    onChange={(e) => setForm({...form, job_title: e.target.value})}
                    placeholder="e.g., Operations Manager"
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
                  <span className="text-sm text-slate-600">Sign up for news and updates</span>
                </label>
              </div>
            </div>

            {/* Business Address */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="h-8 w-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-sm font-bold">2</span>
                Business Address
              </h2>
              
              <div className="space-y-4">
                <div>
                  <Label>Address Line 1 *</Label>
                  <Input
                    value={form.address_line1}
                    onChange={(e) => setForm({...form, address_line1: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Address Line 2</Label>
                  <Input
                    value={form.address_line2}
                    onChange={(e) => setForm({...form, address_line2: e.target.value})}
                    placeholder="Suite, Unit, Building (optional)"
                    className="mt-1"
                  />
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <Label>City *</Label>
                    <Input
                      value={form.city}
                      onChange={(e) => setForm({...form, city: e.target.value})}
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>State *</Label>
                    <Input
                      value={form.state}
                      onChange={(e) => setForm({...form, state: e.target.value})}
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>ZIP Code *</Label>
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
                Business Information
              </h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Company Legal Name</Label>
                  <Input
                    value={form.company_legal_name}
                    onChange={(e) => setForm({...form, company_legal_name: e.target.value})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>DBA / Trade Name (if different)</Label>
                  <Input
                    value={form.dba_name}
                    onChange={(e) => setForm({...form, dba_name: e.target.value})}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>Business Type / Industry *</Label>
                  <Select value={form.business_type} onValueChange={(v) => setForm({...form, business_type: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Do you have an active membership? *</Label>
                  <Select value={form.has_membership} onValueChange={(v) => setForm({...form, has_membership: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="interested">Interested in learning more</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Service Requirements */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="h-8 w-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-sm font-bold">4</span>
                Service Requirements
              </h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Type of Service *</Label>
                  <Select value={form.service_type} onValueChange={(v) => setForm({...form, service_type: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Expected Laundry Frequency *</Label>
                  <Select value={form.laundry_frequency} onValueChange={(v) => setForm({...form, laundry_frequency: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4">
                <Label>Estimated Average Pounds per Pick-up *</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.estimated_lbs}
                  onChange={(e) => setForm({...form, estimated_lbs: e.target.value})}
                  placeholder="e.g., 100"
                  required
                  className="mt-1"
                />
              </div>
            </div>

            {/* Scheduling */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <span className="h-8 w-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-sm font-bold">5</span>
                Best Time to Reach You
              </h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Best Date *</Label>
                  <Input
                    type="date"
                    value={form.best_date}
                    onChange={(e) => setForm({...form, best_date: e.target.value})}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Best Time (Pacific Time) *</Label>
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
                <Label>Additional Notes</Label>
                <Textarea
                  value={form.additional_notes}
                  onChange={(e) => setForm({...form, additional_notes: e.target.value})}
                  placeholder="Any specific requirements or questions?"
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
                {submitting ? "Submitting..." : "SUBMIT QUOTE REQUEST"}
              </Button>
              <p className="text-center text-sm text-slate-500 mt-3">
                By submitting this form, you agree to be contacted by our team.
              </p>
            </div>
          </form>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
