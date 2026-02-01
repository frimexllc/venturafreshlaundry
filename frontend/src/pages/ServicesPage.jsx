import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { 
  Truck, 
  Sparkles, 
  Building2,
  Clock,
  MapPin,
  Phone,
  CheckCircle,
  Star,
  Leaf,
  ArrowRight
} from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero Section */}
      <section className="pt-24 pb-16 bg-gradient-to-b from-sky-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
            Our Services
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            From convenient self-service to professional wash & fold and fast pickup & delivery, we handle every detail so you don't have to.
          </p>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Self Service */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100 hover:shadow-xl transition-shadow">
              <div className="h-14 w-14 rounded-xl bg-sky-100 flex items-center justify-center mb-6">
                <Building2 className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Self Service</h3>
              <p className="text-slate-600 mb-6">
                Our facility offers modern, well-maintained washers and dryers for customers who prefer to handle their own laundry.
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">High-efficiency machines</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">Clean, safe environment</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">Multiple machine sizes</span>
                </li>
              </ul>
              <p className="text-lg font-semibold text-slate-900">Open 6am - 10pm daily</p>
            </div>

            {/* Wash & Fold */}
            <div className="bg-sky-600 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow text-white">
              <div className="h-14 w-14 rounded-xl bg-white/20 flex items-center justify-center mb-6">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-4">Wash & Fold</h3>
              <p className="text-white/90 mb-6">
                Drop off your laundry and let our professionals handle the rest. We wash, dry, and fold to your exact specifications.
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-white/90">Premium detergents</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-white/90">Custom folding preferences</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-white flex-shrink-0 mt-0.5" />
                  <span className="text-white/90">Same-day or next-day service</span>
                </li>
              </ul>
              <p className="text-lg font-semibold">Starting at $1.75/lb</p>
            </div>

            {/* Pickup & Delivery */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100 hover:shadow-xl transition-shadow">
              <div className="h-14 w-14 rounded-xl bg-sky-100 flex items-center justify-center mb-6">
                <Truck className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Pickup & Delivery</h3>
              <p className="text-slate-600 mb-6">
                Never leave your home! We pick up your laundry and deliver it back fresh, clean, and perfectly folded.
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">Flexible scheduling</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">Real-time tracking</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-600">Free delivery on 15+ lbs</span>
                </li>
              </ul>
              <p className="text-lg font-semibold text-slate-900">Covering all Ventura County</p>
            </div>
          </div>
        </div>
      </section>

      {/* Commercial Services */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
                Commercial & B2B Services
              </h2>
              <p className="text-lg text-slate-600 mb-6">
                We serve businesses across Ventura County, including hotels, restaurants, gyms, spas, and more. Get custom pricing based on your volume and needs.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-sky-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-900">Volume Discounts</span>
                    <p className="text-slate-600">Lower per-pound rates for high-volume accounts</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-sky-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-900">Scheduled Pickups</span>
                    <p className="text-slate-600">Regular pickup and delivery on your schedule</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-sky-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-900">Dedicated Account Manager</span>
                    <p className="text-slate-600">Personal support for your business needs</p>
                  </div>
                </li>
              </ul>
              <Link to="/contact">
                <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8 py-3 h-auto">
                  Request a Quote <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h3 className="text-xl font-bold text-slate-900 mb-6">Industries We Serve</h3>
              <div className="grid grid-cols-2 gap-4">
                {["Hotels", "Restaurants", "Gyms & Fitness", "Spas & Salons", "Healthcare", "Airbnb Hosts", "Property Managers", "Event Venues"].map((industry) => (
                  <div key={industry} className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                    <Star className="h-4 w-4 text-sky-500" />
                    <span className="text-slate-700">{industry}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 text-center mb-12">
            Why Choose Ventura Fresh Laundry?
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Star className="h-8 w-8 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Premium Quality</h3>
              <p className="text-slate-600 text-sm">Professional-grade cleaning with attention to detail</p>
            </div>
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Fast Turnaround</h3>
              <p className="text-slate-600 text-sm">Same-day and next-day options available</p>
            </div>
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Leaf className="h-8 w-8 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Eco-Friendly</h3>
              <p className="text-slate-600 text-sm">Energy-efficient machines, less water waste</p>
            </div>
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Personalized</h3>
              <p className="text-slate-600 text-sm">Your preferences saved and followed every time</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-sky-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Get Started?</h2>
          <p className="text-white/90 text-lg mb-8">
            Schedule your first pickup today and experience the difference.
          </p>
          <Link to="/schedule-pickup">
            <Button className="bg-white text-sky-600 hover:bg-slate-100 rounded-full px-10 py-3 h-auto text-lg font-semibold">
              Schedule Pickup
            </Button>
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
