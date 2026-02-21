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

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero Section */}
      <section className="pt-24 pb-16 bg-gradient-to-b from-sky-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
         <h1
  className="text-4xl sm:text-5xl font-bold text-slate-900 mb-6 mt-12"
  style={{ fontFamily: "'Playfair Display', serif" }}
>  About Us
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Ventura Fresh Laundry makes laundry effortless across Ventura County
          </p>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Our Story</h2>
              <p className="text-slate-600 mb-4">
                Founded with a simple mission: to give people their time back. We understand that laundry is one of those never-ending chores that takes hours out of your week – time that could be spent with family, pursuing hobbies, or simply relaxing.
              </p>
              <p className="text-slate-600 mb-4">
                At Ventura Fresh Laundry, we combine professional-grade equipment with personalized service to deliver an exceptional laundry experience. From our self-service facility to our full-service wash & fold and pickup & delivery options, we've designed every aspect of our business around your convenience.
              </p>
              <p className="text-slate-600">
                We're proud to serve Ventura County with the most affordable and reliable laundry services in the area.
              </p>
            </div>
            <div className="bg-sky-50 rounded-2xl p-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center p-4">
                  <div className="text-4xl font-bold text-sky-600 mb-2">5+</div>
                  <p className="text-slate-600">Years of Service</p>
                </div>
                <div className="text-center p-4">
                  <div className="text-4xl font-bold text-sky-600 mb-2">10K+</div>
                  <p className="text-slate-600">Happy Customers</p>
                </div>
                <div className="text-center p-4">
                  <div className="text-4xl font-bold text-sky-600 mb-2">50K+</div>
                  <p className="text-slate-600">Loads Completed</p>
                </div>
                <div className="text-center p-4">
                  <div className="text-4xl font-bold text-sky-600 mb-2">4.9</div>
                  <p className="text-slate-600">Star Rating</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">Our Values</h2>
          <div className="grid md:grid-cols-4 gap-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Star className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Quality First</h3>
              <p className="text-slate-600 text-sm">
                We treat every item with care, using premium products and professional techniques.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Heart className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Customer Care</h3>
              <p className="text-slate-600 text-sm">
                Your satisfaction is our priority. We listen, adapt, and deliver on your preferences.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Community</h3>
              <p className="text-slate-600 text-sm">
                We're proud to be part of Ventura County and committed to serving our neighbors.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
              <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <Award className="h-7 w-7 text-sky-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">Reliability</h3>
              <p className="text-slate-600 text-sm">
                On time, every time. You can count on us to keep our promises.
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
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Visit Our Location</h2>
              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-4">
                  <MapPin className="h-6 w-6 text-sky-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-slate-900">Address</p>
                    <p className="text-slate-600">5722 Telephone Rd #5, Ventura, CA 93003</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Clock className="h-6 w-6 text-sky-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-slate-900">Hours</p>
                    <p className="text-slate-600">Monday - Sunday: 6:00 AM - 10:00 PM</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Phone className="h-6 w-6 text-sky-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-semibold text-slate-900">Phone / Text</p>
                    <p className="text-slate-600">(805) 836-8872</p>
                  </div>
                </div>
              </div>
              <Link to="/contact">
                <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8">
                  Contact Us <ArrowRight className="ml-2 h-4 w-4" />
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
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Experience the Difference?</h2>
          <p className="text-white/90 text-lg mb-8">
            Let us take laundry off your to-do list.
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
