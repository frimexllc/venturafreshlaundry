import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white" data-testid="privacy-page">
      <PublicNav />

      <section className="pt-32 pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-slate-900" data-testid="privacy-title">Ventura Fresh Laundry – Privacy Policy</h1>
            <p className="text-slate-500 mt-2" data-testid="privacy-effective-date">Effective Date: 02/22/26</p>
            <p className="text-slate-700 mt-4" data-testid="privacy-intro">
              Ventura Fresh Laundry (“we”, “our”, “us”) respects your privacy and is committed to protecting your personal information.
              This Privacy Policy explains how we collect, use, and safeguard information when you visit our website or use our services.
            </p>
          </div>

          <div className="space-y-8 text-slate-700 leading-relaxed">
            <div data-testid="privacy-section-1">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Information We Collect</h2>
              <p className="font-semibold">Personal Information</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Full name</li>
                <li>Email address</li>
                <li>Phone number</li>
                <li>Pickup and delivery address</li>
                <li>Payment information (processed securely through third-party payment processors)</li>
              </ul>
              <p className="font-semibold mt-4">Automatically Collected Information</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>IP address</li>
                <li>Browser type</li>
                <li>Device type</li>
                <li>Pages visited</li>
                <li>Date and time of access</li>
              </ul>
            </div>

            <div data-testid="privacy-section-2">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">2. How We Use Your Information</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Process service orders</li>
                <li>Schedule pickups and deliveries</li>
                <li>Communicate order updates</li>
                <li>Provide customer support</li>
                <li>Process payments</li>
                <li>Improve website functionality</li>
                <li>Send service notifications</li>
                <li>Prevent fraud and protect our business</li>
              </ul>
            </div>

            <div data-testid="privacy-section-3">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Payment Processing</h2>
              <p>Payments made through our website may be processed by secure third-party payment providers such as Stripe.</p>
              <p>Ventura Fresh Laundry does not store full credit card details on its servers.</p>
            </div>

            <div data-testid="privacy-section-4">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">4. SMS Communications</h2>
              <p>If you opt-in to receive SMS messages, we may send notifications related to:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Order confirmations</li>
                <li>Pickup reminders</li>
                <li>Order completion</li>
                <li>Delivery notifications</li>
              </ul>
              <p className="mt-2">Message frequency may vary. Message and data rates may apply.</p>
              <p>You may opt out at any time by replying STOP.</p>
            </div>

            <div data-testid="privacy-section-5">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Information Sharing</h2>
              <p>We do not sell or rent personal information. We may share information only with trusted service providers required to operate our business, including:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Payment processors</li>
                <li>Messaging providers</li>
                <li>Delivery logistics tools</li>
                <li>Website hosting services</li>
              </ul>
            </div>

            <div data-testid="privacy-section-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Data Security</h2>
              <p>We implement reasonable security measures to protect personal information.</p>
            </div>

            <div data-testid="privacy-section-7">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Cookies and Tracking</h2>
              <p>Our website may use cookies or similar technologies to enhance functionality and analyze website traffic.</p>
            </div>

            <div data-testid="privacy-section-8">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Children's Privacy</h2>
              <p>Our services are not directed toward individuals under the age of 13.</p>
            </div>

            <div data-testid="privacy-section-9">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">9. Your Privacy Rights</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Request access to your personal information</li>
                <li>Request corrections</li>
                <li>Request deletion of your data</li>
              </ul>
            </div>

            <div data-testid="privacy-section-10">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">10. Changes to This Policy</h2>
              <p>We may update this Privacy Policy from time to time. Updates will be posted on this page with a revised effective date.</p>
            </div>

            <div data-testid="privacy-section-11">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">11. Contact Us</h2>
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
