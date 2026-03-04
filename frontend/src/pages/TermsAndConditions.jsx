import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

export default function TermsAndConditions() {
  return (
    <div className="min-h-screen bg-white" data-testid="terms-page">
      <PublicNav />

      <section className="pt-32 pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-slate-900" data-testid="terms-title">Ventura Fresh Laundry – Terms of Service</h1>
            <p className="text-slate-500 mt-2" data-testid="terms-effective-date">Effective Date: 02/22/26</p>
            <p className="text-slate-700 mt-4">By using the Ventura Fresh Laundry website or services, you agree to the following terms.</p>
          </div>

          <div className="space-y-8 text-slate-700 leading-relaxed">
            <div data-testid="terms-section-1">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Services</h2>
              <p>Ventura Fresh Laundry provides laundry-related services including:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Self-service laundromat</li>
                <li>Wash &amp; Fold services</li>
                <li>Pickup and delivery laundry services</li>
                <li>Laundry-related product sales</li>
              </ul>
            </div>

            <div data-testid="terms-section-2">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Customer Responsibilities</h2>
              <p>Customers agree to provide accurate contact and address information and ensure garments are suitable for standard laundry processing.</p>
              <p className="mt-2">Ventura Fresh Laundry is not responsible for pre-existing garment conditions, items left in pockets, manufacturer defects, or improper garment care instructions.</p>
            </div>

            <div data-testid="terms-section-3">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Payment Terms</h2>
              <p>Payment may be required before or after services depending on service type. Prices and service fees may change without prior notice.</p>
            </div>

            <div data-testid="terms-section-4">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Pickup and Delivery Services</h2>
              <p>Customers must provide accurate addresses, have laundry ready at scheduled pickup times, and be available for delivery when required.</p>
            </div>

            <div data-testid="terms-section-5">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Order Processing</h2>
              <p>Estimated turnaround times are guidelines and may vary depending on order volume, service type, and operational conditions.</p>
            </div>

            <div data-testid="terms-section-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Limitation of Liability</h2>
              <p>To the maximum extent permitted by law, Ventura Fresh Laundry shall not be liable for indirect or consequential damages, loss of business or profits, or damages exceeding the service value provided.</p>
            </div>

            <div data-testid="terms-section-7">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Website Use</h2>
              <p>Users agree not to attempt to hack/disrupt the website, submit fraudulent orders, or misuse the platform.</p>
            </div>

            <div data-testid="terms-section-8">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Changes to Terms</h2>
              <p>Ventura Fresh Laundry reserves the right to update these Terms of Service at any time.</p>
            </div>

            <div data-testid="terms-section-9">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Governing Law</h2>
              <p>These Terms shall be governed by the laws of the State of California, United States.</p>
            </div>

            <div data-testid="terms-section-10">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">10. Contact</h2>
              <p>Ventura Fresh Laundry</p>
              <p>Website: https://venturafreshlaundry.com</p>
              <p>Email: info@venturafreshlaundry.com</p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}