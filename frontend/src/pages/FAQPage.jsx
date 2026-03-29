import { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle, Search } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { Input } from "../components/ui/input";
import { useLocale } from "../context/LocaleContext";

const FAQ_DATA = [
  { q: "How does pickup & delivery work?", qEs: "Como funciona el servicio de pickup y delivery?", a: "We pick up your laundry from your door, wash, dry, fold, and deliver it back — usually within 24-48 hours. Simply schedule a pickup online or call us.", aEs: "Recogemos tu ropa en tu puerta, lavamos, secamos, doblamos y la entregamos de vuelta — generalmente en 24-48 horas. Simplemente agenda un pickup en linea o llamanos.", cat: "Services" },
  { q: "What areas do you serve?", qEs: "Que areas cubren?", a: "We serve Ventura County including ZIP codes 93001, 93003, 93004, 93010, 93030, 93035, and 93036. The first 3 miles from our location are free delivery. Beyond that, a dynamic mileage fee applies.", aEs: "Cubrimos Ventura County incluyendo los codigos postales 93001, 93003, 93004, 93010, 93030, 93035 y 93036. Las primeras 3 millas desde nuestra ubicacion son envio gratis. Mas alla de eso aplica una tarifa dinamica por milla.", cat: "Delivery" },
  { q: "What detergents do you use?", qEs: "Que detergentes usan?", a: "We use premium authorized brands: Tide, Gain, Ariel, Arm & Hammer, OxiClean, and more. You can choose your preferred detergent, softener, and dryer sheets when placing your order.", aEs: "Usamos marcas premium autorizadas: Tide, Gain, Ariel, Arm & Hammer, OxiClean, y mas. Puedes elegir tu detergente, suavizante y hojas de secadora preferidos al hacer tu orden.", cat: "Products" },
  { q: "What payment methods do you accept?", qEs: "Que metodos de pago aceptan?", a: "We accept Credit/Debit cards (tap, chip, swipe), Apple Pay, Google Pay, Zelle, and Cash. For delivery orders, payment must be confirmed before dispatch.", aEs: "Aceptamos tarjetas de credito/debito (tap, chip, swipe), Apple Pay, Google Pay, Zelle y Efectivo. Para ordenes con delivery, el pago debe confirmarse antes del envio.", cat: "Payments" },
  { q: "How much does it cost?", qEs: "Cuanto cuesta?", a: "Wash & Fold starts at $1.75/lb with a 10lb minimum. Pickup & Delivery pricing varies by service type. Commercial/B2B accounts get custom pricing. Check our Services page or request a quote.", aEs: "Wash & Fold empieza en $1.75/lb con minimo de 10lb. El precio de Pickup & Delivery varia por tipo de servicio. Cuentas comerciales/B2B tienen precios personalizados. Revisa nuestra pagina de Servicios o solicita una cotizacion.", cat: "Pricing" },
  { q: "Do you offer memberships?", qEs: "Ofrecen membresias?", a: "Yes! Our membership plans offer discounted rates, priority pickup, free delivery, and more. Visit our Memberships page to see available plans.", aEs: "Si! Nuestros planes de membresia ofrecen tarifas con descuento, pickup prioritario, envio gratis, y mas. Visita nuestra pagina de Membresias para ver los planes disponibles.", cat: "Memberships" },
  { q: "How do I track my order?", qEs: "Como rastreo mi orden?", a: "You'll receive SMS/WhatsApp/Email notifications at each stage: pickup confirmed, in process, ready, and out for delivery. You can also check your order status online.", aEs: "Recibiras notificaciones por SMS/WhatsApp/Email en cada etapa: pickup confirmado, en proceso, listo, y en camino. Tambien puedes consultar el estado de tu orden en linea.", cat: "Orders" },
  { q: "What about Airbnb/Vacation Rental linens?", qEs: "Que hay sobre ropa de cama de Airbnb/Vacacional?", a: "We specialize in vacation rental turnovers! We handle sheets, towels, and linens with professional-grade cleaning. Fast turnaround for same-day checkouts.", aEs: "Nos especializamos en cambios de ropa para rentas vacacionales! Manejamos sabanas, toallas y ropa de cama con lavado de grado profesional. Entrega rapida para checkouts del mismo dia.", cat: "Services" },
  { q: "Can I request special treatment for my clothes?", qEs: "Puedo pedir tratamiento especial para mi ropa?", a: "Absolutely. Add special instructions to your order: cold wash, no bleach, hypoallergenic detergent, extra softener, hang dry, etc. We respect all preferences.", aEs: "Absolutamente. Agrega instrucciones especiales a tu orden: lavado en frio, sin blanqueador, detergente hipoalergenico, extra suavizante, secado al aire, etc. Respetamos todas las preferencias.", cat: "Services" },
  { q: "Do you offer commercial/B2B accounts?", qEs: "Ofrecen cuentas comerciales/B2B?", a: "Yes — restaurants, hotels, salons, medical offices and more. We offer volume pricing, scheduled pickups, dedicated account management, and net payment terms.", aEs: "Si — restaurantes, hoteles, salones, consultorios medicos y mas. Ofrecemos precios por volumen, pickups programados, gestion de cuenta dedicada, y terminos de pago netos.", cat: "B2B" },
];

export default function FAQPage() {
  const { t } = useLocale();
  const [openIdx, setOpenIdx] = useState(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");

  const cats = [...new Set(FAQ_DATA.map(f => f.cat))];
  const filtered = FAQ_DATA.filter(f => {
    const q = search.toLowerCase();
    const matchSearch = !q || f.q.toLowerCase().includes(q) || f.qEs.toLowerCase().includes(q) || f.a.toLowerCase().includes(q) || f.aEs.toLowerCase().includes(q);
    const matchCat = !catFilter || f.cat === catFilter;
    return matchSearch && matchCat;
  });

  return (
    <>
      <PublicNav />
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4"><HelpCircle className="w-7 h-7 text-blue-600" /></div>
            <h1 className="text-4xl font-bold text-gray-900 mb-3">{t("Frequently Asked Questions", "Preguntas Frecuentes")}</h1>
            <p className="text-gray-500 text-lg">{t("Everything you need to know about our laundry services", "Todo lo que necesitas saber sobre nuestros servicios de lavanderia")}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input placeholder={t("Search...", "Buscar...")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="faq-search" /></div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setCatFilter("")} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${!catFilter ? "bg-gray-900 text-white" : "bg-white text-gray-600 border-gray-200"}`}>{t("All", "Todos")}</button>
              {cats.map(c => <button key={c} onClick={() => setCatFilter(c)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${catFilter === c ? "bg-gray-900 text-white" : "bg-white text-gray-600 border-gray-200"}`}>{c}</button>)}
            </div>
          </div>
          <div className="space-y-3">
            {filtered.map((faq, i) => {
              const isOpen = openIdx === i;
              return (
                <div key={i} className={`border rounded-xl overflow-hidden transition-colors ${isOpen ? "border-blue-200 bg-blue-50/30" : "bg-white hover:border-gray-300"}`} data-testid={`faq-${i}`}>
                  <button onClick={() => setOpenIdx(isOpen ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left">
                    <span className="font-medium text-gray-900 pr-4">{t(faq.q, faq.qEs)}</span>
                    {isOpen ? <ChevronUp className="w-5 h-5 text-blue-600 shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />}
                  </button>
                  {isOpen && <div className="px-5 pb-4 text-gray-600 text-sm leading-relaxed border-t border-gray-100 pt-3">{t(faq.a, faq.aEs)}</div>}
                </div>
              );
            })}
            {filtered.length === 0 && <div className="text-center py-12 text-gray-400">{t("No results found", "Sin resultados")}</div>}
          </div>
        </div>
      </div>
      <PublicFooter />
    </>
  );
}
