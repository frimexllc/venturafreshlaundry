import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { ShoppingBag, ArrowRight } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

export default function StorePage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero Section */}
      <section className="pt-24 pb-16 bg-gradient-to-b from-sky-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
            Store
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Shop laundry essentials and accessories
          </p>
        </div>
      </section>

      {/* Coming Soon */}
      <section className="py-32">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="h-24 w-24 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-8">
            <ShoppingBag className="h-12 w-12 text-sky-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-4">No products available yet</h2>
          <p className="text-slate-600 mb-8">
            We're working on bringing you quality laundry products and accessories. Check back soon!
          </p>
          <p className="text-slate-500 mb-8">
            In the meantime, visit us in-store for all your laundry supplies.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/services">
              <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8">
                View Services <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/contact">
              <Button variant="outline" className="rounded-full px-8">
                Contact Us
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
