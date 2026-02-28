import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

export default function TermsAndConditions() {
  const { t } = useLocale();

  return (
    <div className="min-h-screen bg-white" data-testid="terms-page">
      <PublicNav />

      <section className="pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-slate-900" data-testid="terms-title">
              {t("Terms and Conditions", "Términos y Condiciones")}
            </h1>
            <p className="text-slate-500 mt-2" data-testid="terms-updated">
              {t("Last updated: February 22, 2026", "Última actualización: 22 de febrero de 2026")}
            </p>
          </div>

          <div className="space-y-8 text-slate-700 leading-relaxed">
            <div data-testid="terms-section-acceptance">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">
                {t("1. Acceptance of Terms", "1. Aceptación de los términos")}
              </h2>
              <p>
                {t(
                  "By accessing and using the services of Ventura Fresh Laundry, you agree to comply with these terms and conditions. If you do not agree, do not use the platform.",
                  "Al acceder y utilizar los servicios de Ventura Fresh Laundry, aceptas cumplir con estos términos y condiciones. Si no estás de acuerdo, no utilices la plataforma."
                )}
              </p>
            </div>

            <div data-testid="terms-section-services">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">
                {t("2. Services", "2. Servicios")}
              </h2>
              <p>
                {t(
                  "We offer laundry, pickup, delivery, memberships and commercial services. Service times are estimates and may vary based on demand and operational capacity.",
                  "Ofrecemos servicios de lavandería, pickup, entrega, membresías y atención comercial. Los tiempos de servicio son estimados y pueden variar según demanda y capacidad operativa."
                )}
              </p>
            </div>

            <div data-testid="terms-section-payments">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">
                {t("3. Payments and Memberships", "3. Pagos y membresías")}
              </h2>
              <p>
                {t(
                  "Payments are processed securely. Memberships are recurring and will renew according to the selected plan until cancelled. The customer is responsible for keeping their payment information up to date.",
                  "Los pagos se procesan de forma segura. Las membresías son recurrentes y se renovarán según el plan seleccionado hasta su cancelación. El cliente es responsable de mantener su información de pago actualizada."
                )}
              </p>
            </div>

            <div data-testid="terms-section-customer">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">
                {t("4. Customer Responsibilities", "4. Responsabilidades del cliente")}
              </h2>
              <p>
                {t(
                  "The customer must provide accurate information about addresses, access and preferences. Items must be prepared for pickup at the agreed time.",
                  "El cliente debe proporcionar información precisa sobre direcciones, accesos y preferencias. Las prendas deben estar preparadas para su recolección en el horario acordado."
                )}
              </p>
            </div>

            <div data-testid="terms-section-liability">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">
                {t("5. Limitation of Liability", "5. Limitación de responsabilidad")}
              </h2>
              <p>
                {t(
                  "Ventura Fresh Laundry shall not be liable for indirect damages, consequential losses or delays caused by factors beyond our reasonable control.",
                  "Ventura Fresh Laundry no será responsable por daños indirectos, pérdidas consecuenciales o retrasos causados por factores fuera de nuestro control razonable."
                )}
              </p>
            </div>

            <div data-testid="terms-section-changes">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">
                {t("6. Changes to Terms", "6. Cambios en los términos")}
              </h2>
              <p>
                {t(
                  "We may update these terms periodically. Modifications will be published on this page and will be deemed accepted by continuing to use the service.",
                  "Podemos actualizar estos términos periódicamente. Las modificaciones se publicarán en esta página y se considerarán aceptadas al continuar usando el servicio."
                )}
              </p>
            </div>

            <div data-testid="terms-section-contact">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">
                {t("7. Contact", "7. Contacto")}
              </h2>
              <p>
                {t(
                  "For questions about these terms, contact us at support@venturafreshlaundry.com.",
                  "Para preguntas sobre estos términos, contáctanos en soporte@venturafreshlaundry.com."
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}