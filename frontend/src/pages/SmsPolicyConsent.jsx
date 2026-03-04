import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

export default function SmsPolicyConsent() {
  return (
    <div className="min-h-screen bg-white" data-testid="sms-policy-page">
      <PublicNav />

      <section className="pt-32 pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-slate-900" data-testid="sms-policy-title">
              Ventura Fresh Laundry – SMS Messaging Policy
            </h1>
            <p className="text-slate-500 mt-2" data-testid="sms-policy-effective-date">Effective Date: 02/22/26</p>
          </div>

          <div className="space-y-8 text-slate-700 leading-relaxed">
            <div data-testid="sms-policy-program">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">SMS Program Description</h2>
              <p>Ventura Fresh Laundry offers SMS notifications to provide customers with updates related to their laundry services.</p>
              <p className="mt-2">Messages may include order confirmations, pickup reminders, order status updates, and delivery notifications.</p>
            </div>

            <div data-testid="sms-policy-optin">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">Opt-In</h2>
              <p>Customers may opt-in to receive SMS messages by:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Submitting service request forms on our website and checking the SMS consent checkbox</li>
                <li>Requesting services and providing consent to receive SMS notifications</li>
                <li>Texting opt-in keywords such as START to our business phone number</li>
              </ul>
            </div>

            <div data-testid="sms-policy-rates">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">Message Frequency and Rates</h2>
              <p>Message frequency may vary depending on service activity.</p>
              <p>Message and data rates may apply depending on the customer’s mobile carrier plan.</p>
            </div>

            <div data-testid="sms-policy-optout">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">Opt-Out / Help</h2>
              <p>Customers can opt-out at any time by replying <strong>STOP</strong>.</p>
              <p>For assistance, customers may reply <strong>HELP</strong>.</p>
            </div>

            <div data-testid="sms-policy-consent-disclosure">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">SMS Consent Disclosure</h2>
              <p>
                By providing your phone number and opting-in through our website forms, you consent to receive SMS
                notifications from Ventura Fresh Laundry regarding service updates.
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Order confirmations</li>
                <li>Pickup reminders</li>
                <li>Delivery notifications</li>
                <li>Service alerts</li>
              </ul>
              <p className="mt-2">Message frequency may vary. Message and data rates may apply.</p>
              <p>You can opt-out anytime by replying STOP. For help reply HELP.</p>
              <p>Your phone number will never be sold or shared with third parties for marketing purposes.</p>
            </div>

            <div data-testid="sms-policy-privacy">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">Privacy</h2>
              <p>
                Customer phone numbers and personal information will be handled according to our Privacy Policy and
                will not be sold to third parties.
              </p>
            </div>

            <div data-testid="sms-policy-contact">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">Contact</h2>
              <p>Ventura Fresh Laundry</p>
              <p>https://venturafreshlaundry.com</p>
              <p>info@venturafreshlaundry.com</p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
