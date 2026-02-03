import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

// Accordion Component
const AccordionItem = ({ title, children, isOpen, onClick }) => (
  <div className="border-b border-slate-200 last:border-0">
    <button
      onClick={onClick}
      className="w-full py-4 flex items-center justify-between text-left"
    >
      <span className="text-lg font-bold text-slate-900">{title}</span>
      {isOpen ? (
        <ChevronUp className="h-5 w-5 text-sky-600" />
      ) : (
        <ChevronDown className="h-5 w-5 text-slate-400" />
      )}
    </button>
    <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[500px] pb-4' : 'max-h-0'}`}>
      {children}
    </div>
  </div>
);

export default function ServicesPage() {
  const [openB2B, setOpenB2B] = useState(0);
  const [openCommercial, setOpenCommercial] = useState(0);

  return (
    <div className="min-h-screen bg-white">
      <PublicNav />

      {/* Hero Section */}
      <section className="relative min-h-[60vh] flex items-end justify-center overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ 
            backgroundImage: "url('https://images.unsplash.com/photo-1545173168-9f1947eebb7f?w=1920&h=1080&fit=crop')"
          }}
        >
          <div className="absolute inset-0 bg-black/40"></div>
        </div>
        <div className="relative z-10 text-center px-4 pb-16 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            A clean space for everyone and every load.
          </h1>
        </div>
      </section>

      {/* Services Section */}
      <section className="relative py-20 overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=1920&h=1080&fit=crop')" }}
        >
          <div className="absolute inset-0 bg-white/70"></div>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 text-center mb-12">
            Choose the option that fits your day; walk-in, drop-off, or pickup & delivery.
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Pickup & Delivery */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100">
              <h3 className="text-2xl font-bold text-slate-900 text-center mb-4">
                🚚 Pickup & Delivery
              </h3>
              <p className="text-slate-600 text-center mb-2">
                Laundry, fully automated on your schedule.
              </p>
              <p className="text-slate-600 text-center mb-6">
                We pick up, clean, fold, and return your clothes right to your door, exactly how you like them.
              </p>
              <div className="space-y-3 mb-6">
                <p className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span><strong>Member recurring service:</strong> $2.50/lb (minimum $40)</span>
                </p>
                <p className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span><strong>As-needed service:</strong> $2.75/lb (minimum $40)</span>
                </p>
                <p className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span><strong>Pickup window & preferences confirmed every time</strong></span>
                </p>
              </div>
              <div className="text-center">
                <Link to="/schedule-pickup">
                  <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8">
                    SCHEDULE PICK-UP
                  </Button>
                </Link>
              </div>
            </div>

            {/* Wash Dry Fold */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100">
              <h3 className="text-2xl font-bold text-slate-900 text-center mb-4">
                🧺 Wash • Dry • Fold
              </h3>
              <p className="text-slate-600 text-center mb-2">
                Professional care for customers who want their laundry done right without lifting a finger.
              </p>
              <p className="text-slate-600 text-center mb-6">
                We wash, dry, and fold every order with attention to detail, premium products, and consistent quality you can trust.
              </p>
              <div className="space-y-3 mb-6">
                <p className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span><strong>$2.25 per pound</strong></span>
                </p>
                <p className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span><strong>10 lb minimum order</strong> (orders under 10 lb are billed as 10 lb)</span>
                </p>
                <p className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span><strong>Custom folding preferences available</strong></span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* B2B Services Section */}
      <section className="py-20 relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1920&h=1080&fit=crop')" }}
        >
          <div className="absolute inset-0 bg-sky-900/85"></div>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
            High-Performance B2B Laundry Solutions for Growing Businesses
          </h2>
          <p className="text-white/90 mb-2"><strong>Reliable, scalable, and professional laundry services designed to support your operations</strong></p>
          <p className="text-white/90 mb-8"><strong>Built to handle volume, quality, and reliability every single day.</strong></p>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-6">
            <AccordionItem 
              title="B2B Services" 
              isOpen={openB2B === 0}
              onClick={() => setOpenB2B(openB2B === 0 ? -1 : 0)}
            >
              <p className="text-white/90">
                We provide tailored B2B laundry solutions that help businesses maintain the highest standards of cleanliness while reducing operational costs. From hospitality and healthcare to fitness centers and corporate facilities, our commercial-grade processes ensure consistent quality, fast turnaround, and dependable service you can trust.
              </p>
            </AccordionItem>
            <AccordionItem 
              title="Key Features & Services" 
              isOpen={openB2B === 1}
              onClick={() => setOpenB2B(openB2B === 1 ? -1 : 1)}
            >
              <ul className="text-white/90 space-y-2">
                <li>• Customized laundry programs for businesses of all sizes</li>
                <li>• Commercial-grade washing and stain removal</li>
                <li>• Scheduled pickup & delivery for maximum efficiency</li>
                <li>• Flexible volume options with no long-term commitments</li>
                <li>• Priority support for business clients</li>
              </ul>
            </AccordionItem>
          </div>

          <div className="text-center mt-8">
            <Link to="/contact">
              <Button className="bg-white text-sky-600 hover:bg-slate-100 rounded-full px-8">
                REQUEST A QUOTE
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Commercial Services Section */}
      <section className="py-20 relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1521791055366-0d553872125f?w=1920&h=1080&fit=crop')" }}
        >
          <div className="absolute inset-0 bg-slate-900/75"></div>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
            Commercial Services
          </h2>
          <p className="text-white/90 mb-2"><strong>Professional Commercial Laundry Services You Can Depend On</strong></p>
          <p className="text-white/90 mb-8"><strong>Built to handle volume, quality, and reliability every single day.</strong></p>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 p-6">
            <AccordionItem 
              title="Commercial Services" 
              isOpen={openCommercial === 0}
              onClick={() => setOpenCommercial(openCommercial === 0 ? -1 : 0)}
            >
              <p className="text-white/90">
                Our commercial laundry services are designed to meet the demands of high-traffic businesses. Whether you manage a restaurant, hotel, spa, gym, or office facility, we deliver consistent results, dependable logistics, and a service plan tailored to your business needs.
              </p>
            </AccordionItem>
            <AccordionItem 
              title="Key Features & Services" 
              isOpen={openCommercial === 1}
              onClick={() => setOpenCommercial(openCommercial === 1 ? -1 : 1)}
            >
              <ul className="text-white/90 space-y-2">
                <li>• Laundry solutions for restaurants, hotels, spas, gyms, and offices</li>
                <li>• High-volume processing with commercial equipment</li>
                <li>• Specialized care for uniforms, linens, and delicate fabrics</li>
                <li>• Reliable pickup & delivery with strict quality control</li>
                <li>• Flexible billing and service plans</li>
              </ul>
            </AccordionItem>
          </div>

          <div className="text-center mt-8">
            <Link to="/contact">
              <Button className="bg-white text-slate-900 hover:bg-slate-100 rounded-full px-8">
                REQUEST A QUOTE
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Membership Section */}
      <section className="py-20" style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 50%, #0369a1 100%)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
              MEMBERSHIP
            </h2>
            <p className="text-2xl text-white mb-2">🎉 New Member Special</p>
            <p className="text-xl text-white/90">$10 OFF your first month (any membership). Ask when you call or text.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Basic */}
            <div className="bg-white rounded-2xl p-8 shadow-xl text-center">
              <div className="h-20 w-20 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🧺</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">BASIC</h3>
              <p className="text-3xl font-bold text-sky-600 mb-6">$79 / month</p>
              <ul className="text-left space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Up to 30 lb/month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Pickup & Delivery (recurring)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Ideal for couples or light laundry</span>
                </li>
              </ul>
            </div>

            {/* Most Popular */}
            <div className="bg-white rounded-2xl p-8 shadow-xl text-center border-4 border-sky-500 relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-sky-500 text-white px-4 py-1 rounded-full text-sm font-bold">
                MOST POPULAR
              </div>
              <div className="h-20 w-20 rounded-full bg-sky-500 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⭐</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">STANDARD</h3>
              <p className="text-3xl font-bold text-sky-600 mb-6">$139 / month</p>
              <ul className="text-left space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Up to 60 lb/month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Preferences saved (folding notes)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Best value for most families</span>
                </li>
              </ul>
            </div>

            {/* Family Plus */}
            <div className="bg-white rounded-2xl p-8 shadow-xl text-center">
              <div className="h-20 w-20 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">👨‍👩‍👧‍👦</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">FAMILY PLUS</h3>
              <p className="text-3xl font-bold text-sky-600 mb-6">$199 / month</p>
              <ul className="text-left space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Up to 90 lb/month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Priority scheduling</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>Premium packaging</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>1 emergency pickup included</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="text-center mt-12">
            <p className="text-white/90 mb-6">
              Not sure which plan is best? Just <strong>call, text, or email us at (805) 836-8872</strong> and we'll recommend the right membership based on your weekly laundry.
            </p>
            <Link to="/contact">
              <Button className="bg-white text-sky-600 hover:bg-slate-100 rounded-full px-8 py-4 text-lg font-semibold">
                BECOME A MEMBER
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Quote Section */}
      <section className="relative py-24 overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?w=1920&h=1080&fit=crop')" }}
        >
          <div className="absolute inset-0 bg-black/60"></div>
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white italic" style={{ fontFamily: "'Playfair Display', serif" }}>
            "If you care for your laundry, you'll notice the difference."
          </h2>
          <p className="text-xl text-white/80 mt-4 italic">Clean linens, happy clients…</p>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-slate-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
              Pricing
            </h2>
            <p className="text-xl text-sky-600 font-semibold">
              Transparent pricing. No surprises. Premium service you can count on.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Pickup & Delivery Pricing */}
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h3 className="text-2xl font-bold text-slate-900 text-center mb-6">Pickup & Delivery</h3>
              <table className="w-full mb-6">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-2 text-left font-semibold">Option</th>
                    <th className="py-2 text-center font-semibold">Rate</th>
                    <th className="py-2 text-right font-semibold">Minimum</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-3">Recurring (Subscription)</td>
                    <td className="py-3 text-center">$2.50/lb</td>
                    <td className="py-3 text-right">$40</td>
                  </tr>
                  <tr>
                    <td className="py-3">As Needed</td>
                    <td className="py-3 text-center">$2.75/lb</td>
                    <td className="py-3 text-right">$40</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-slate-600 text-sm text-center">
                Recurring service is designed for weekly or bi-weekly customers, families, professionals, and rentals.
              </p>
              <div className="text-center mt-6">
                <Link to="/schedule-pickup">
                  <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-8">
                    SCHEDULE PICK UP
                  </Button>
                </Link>
              </div>
            </div>

            {/* Self Service Pricing */}
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h3 className="text-2xl font-bold text-slate-900 text-center mb-6">Self Service</h3>
              <p className="text-slate-600 text-center mb-6">Walk in and wash anytime during our store hours.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-bold text-slate-900 mb-3">Washers</h4>
                  <ul className="space-y-2 text-sm">
                    <li>✓ 20 lb (2 Load): <strong>$4.00</strong></li>
                    <li>✓ 30 lb (3 Load): <strong>$5.25</strong></li>
                    <li>✓ 40 lb (4 Load): <strong>$6.00</strong></li>
                    <li>✓ 60 lb (6 Load): <strong>$7.75</strong></li>
                    <li>✓ 90 lb (9 Load): <strong>$11.25</strong></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-3">Dryers (30 min)</h4>
                  <ul className="space-y-2 text-sm">
                    <li>✓ 30 lb: <strong>$2.25</strong></li>
                    <li>✓ 50 lb: <strong>$2.50</strong></li>
                    <li>✓ 80 lb: <strong>$3.00</strong></li>
                  </ul>
                  <p className="text-xs text-slate-500 mt-4">+6 min extra: $0.25</p>
                </div>
              </div>
            </div>
          </div>

          {/* Per Piece Pricing */}
          <div className="mt-8 bg-white rounded-2xl p-8 shadow-lg">
            <h3 className="text-2xl font-bold text-slate-900 text-center mb-6">Per Piece Pricing</h3>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div className="space-y-2">
                <p>Bath Mat: <strong>$5.00</strong></p>
                <p>Cooking Glove: <strong>$5.00</strong></p>
                <p>Pet Bed (Small): <strong>$5.00</strong></p>
                <p>Pet Bed (M/L): <strong>$8.00</strong></p>
              </div>
              <div className="space-y-2">
                <p>Standard Pillow: <strong>$8.00</strong></p>
                <p>Large Pillow: <strong>$10.00</strong></p>
                <p>Duvet Cover: <strong>$8.00</strong></p>
                <p>Blanket: <strong>$10.00</strong></p>
              </div>
              <div className="space-y-2">
                <p>Comforter (T/D/Q): <strong>$18.00</strong></p>
                <p>Comforter (King): <strong>$20.00</strong></p>
                <p>Mattress Cover: <strong>$20.00</strong></p>
                <p>Down Comforters: <strong>$40.00</strong></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
