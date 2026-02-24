import { useState } from "react";
import { Link } from "react-router-dom";
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
import { Truck, CheckCircle } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Helper to extract error message from Pydantic validation errors
const getErrorMessage = (error) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || d.message || JSON.stringify(d)).join(", ");
  }
  return "Error submitting request";
};

export default function SchedulePickup() {
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
    service_type: "",
    pickup_date: "",
    pickup_time: "",
    notes: "",
  });

  const resetForm = () => {
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
      service_type: "",
      pickup_date: "",
      pickup_time: "",
      notes: "",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validaciones simples (porque Select no siempre “respeta” required como un input nativo)
    if (!form.contact_method) {
      toast.error("Please select the best way to contact you.");
      return;
    }
    if (!form.service_type) {
      toast.error("Please select a service type.");
      return;
    }
    if (!form.pickup_time) {
      toast.error("Please select a preferred time window.");
      return;
    }

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

      const res = await axios.post(`${API}/public/pickup-request`, {
        name: fullName,
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: fullAddress,
        pickup_date: form.pickup_date,
        pickup_time: form.pickup_time,
        service_type: form.service_type,
        contact_method: form.contact_method,
        notes: `Preferred contact: ${form.contact_method}\n${form.notes?.trim() || ""}`.trim(),
      });

      toast.success(res.data?.message || "Request submitted!");
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

        {/* 👇 pt-40 para que no choque con el nav absolute */}
        <section className="pt-40 pb-20">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>

            <h1 className="text-3xl font-bold text-slate-900 mb-4">
              Request Submitted!
            </h1>

            <p className="text-lg text-slate-600 mb-8">
              Thank you for scheduling a pickup. Our team will reach out to
              confirm your pickup time and service preferences.
            </p>

            <Button
              onClick={() => {
                setSubmitted(false);
                resetForm();
              }}
              className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8"
            >
              Schedule Another Pickup
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

      {/* 👇 pt-40 para que el hero quede abajo del nav absolute */}
      <section className="pt-40 pb-8 bg-gradient-to-b from-sky-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="h-16 w-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-6">
            <Truck className="h-8 w-8 text-sky-600" />
          </div>

          <h1
            className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Your Pick-up Begins Here!
          </h1>

          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Provide your information below and our team will reach out to confirm
            your pickup time and service preferences.
          </p>
        </div>
      </section>

      {/* Form Section */}
      <section className="py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl p-6 md:p-8 shadow-lg border border-slate-100"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              Let&apos;s Work Together
            </h2>

            {/* Name */}
            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-3">Name</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-600 text-sm">First Name *</Label>
                  <Input
                    value={form.first_name}
                    onChange={(e) =>
                      setForm({ ...form, first_name: e.target.value })
                    }
                    required
                    className="mt-1"
                    data-testid="pickup-first-name"
                  />
                </div>
                <div>
                  <Label className="text-slate-600 text-sm">Last Name *</Label>
                  <Input
                    value={form.last_name}
                    onChange={(e) =>
                      setForm({ ...form, last_name: e.target.value })
                    }
                    required
                    className="mt-1"
                    data-testid="pickup-last-name"
                  />
                </div>
              </div>
            </div>

            {/* Email */}
            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-3">Email *</h3>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                placeholder="your@email.com"
                data-testid="pickup-email"
              />
            </div>

            {/* Phone */}
            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-3">Phone *</h3>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
                placeholder="+1 (___) ___-____"
                data-testid="pickup-phone"
              />
            </div>

            {/* Contact Method */}
            <div className="mb-6">
              <Label className="font-semibold text-slate-900">
                Best way to contact you *
              </Label>
              <Select
                value={form.contact_method}
                onValueChange={(v) => setForm({ ...form, contact_method: v })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone Call</SelectItem>
                  <SelectItem value="text">Text Message</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Address */}
            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-3">Address *</h3>
              <div className="space-y-4">
                <div>
                  <Label className="text-slate-600 text-sm">
                    Address Line 1 *
                  </Label>
                  <Input
                    value={form.address_line1}
                    onChange={(e) =>
                      setForm({ ...form, address_line1: e.target.value })
                    }
                    required
                    className="mt-1"
                    placeholder="Street address"
                    data-testid="pickup-address1"
                  />
                </div>

                <div>
                  <Label className="text-slate-600 text-sm">Address Line 2</Label>
                  <Input
                    value={form.address_line2}
                    onChange={(e) =>
                      setForm({ ...form, address_line2: e.target.value })
                    }
                    className="mt-1"
                    placeholder="Apt, Suite, Unit, etc. (optional)"
                  />
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-slate-600 text-sm">City *</Label>
                    <Input
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      required
                      className="mt-1"
                      data-testid="pickup-city"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-600 text-sm">State *</Label>
                    <Input
                      value={form.state}
                      onChange={(e) =>
                        setForm({ ...form, state: e.target.value })
                      }
                      required
                      className="mt-1"
                      placeholder="CA"
                      data-testid="pickup-state"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-600 text-sm">ZIP Code *</Label>
                    <Input
                      value={form.zip_code}
                      onChange={(e) =>
                        setForm({ ...form, zip_code: e.target.value })
                      }
                      required
                      className="mt-1"
                      data-testid="pickup-zip"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Laundry Preferences */}
            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-3">
                Laundry Preferences (Optional)
              </h3>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Detergent type, folding style, hang dry items, special instructions, etc."
              />
            </div>

            {/* Service Type */}
            <div className="mb-6">
              <Label className="font-semibold text-slate-900">
                Type of service *
              </Label>
              <Select
                value={form.service_type}
                onValueChange={(v) => setForm({ ...form, service_type: v })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pickup_delivery">Pickup & Delivery</SelectItem>
                  <SelectItem value="commercial">Commercial / B2B</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-2">
                ¿Necesitas Wash & Fold?{" "}
                <Link to="/wash-fold" className="text-sky-600 hover:underline" data-testid="wash-fold-form-link">
                  Ir al formulario
                </Link>
              </p>
            </div>

            {/* Pickup Date & Time */}
            <div className="mb-8">
              <h3 className="font-semibold text-slate-900 mb-3">Pickup Schedule</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-600 text-sm">Preferred Date</Label>
                  <Input
                    type="date"
                    value={form.pickup_date}
                    onChange={(e) =>
                      setForm({ ...form, pickup_date: e.target.value })
                    }
                    className="mt-1"
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>

                <div>
                  <Label className="text-slate-600 text-sm">Preferred Time *</Label>
                  <Select
                    value={form.pickup_time}
                    onValueChange={(v) => setForm({ ...form, pickup_time: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select time window" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8am-12pm">8:00 AM - 12:00 PM</SelectItem>
                      <SelectItem value="2pm-6pm">2:00 PM - 6:00 PM</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">Pacific Time</p>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-sky-500 hover:bg-sky-600 text-white h-12 rounded-full text-lg font-semibold"
              disabled={submitting}
              data-testid="pickup-submit-btn"
            >
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </form>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}