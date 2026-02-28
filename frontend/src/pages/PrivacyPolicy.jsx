import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

export default function PrivacyPolicy() {
  const { t } = useLocale();

  return (
    <div className="min-h-screen bg-white" data-testid="privacy-page">
      <PublicNav />

      <section className="pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-slate-900" data-testid="privacy-title">
              {t("Privacy Policy", "Política de Privacidad")}
            </h1>
            <p className="text-slate-500 mt-2" data-testid="privacy-updated">
              {t("Last updated: February 22, 2026", "Última actualización: 22 de febrero de 2026")}
            </p>
          </div>

          <div className="space-y-8 text-slate-700 leading-relaxed">
            <div data-testid="privacy-section-data">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t("1. Information we collect", "1. Información que recopilamos")}</h2>
              <p>
                {t(
                  "We collect contact information, addresses, service preferences, order history, and details necessary to process payments and deliveries.",
                  "Recopilamos datos de contacto, direcciones, preferencias de servicio, historial de órdenes, y detalles necesarios para procesar pagos y entregas."
                )}
              </p>
            </div>

            <div data-testid="privacy-section-use">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t("2. Use of information", "2. Uso de la información")}</h2>
              <p>
                {t(
                  "We use the information to operate the service, confirm orders, send notifications, and improve the customer experience. We do not sell your information to third parties.",
                  "Usamos la información para operar el servicio, confirmar órdenes, enviar notificaciones, y mejorar la experiencia del cliente. No vendemos tu información a terceros."
                )}
              </p>
            </div>

            <div data-testid="privacy-section-sharing">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t("3. Sharing with third parties", "3. Compartición con terceros")}</h2>
              <p>
                {t(
                  "We share data only with providers necessary for the service (e.g., payment processors and couriers). These providers are required to protect your information.",
                  "Compartimos datos solo con proveedores necesarios para el servicio (por ejemplo, procesadores de pago y mensajería). Estos proveedores están obligados a proteger tu información."
                )}
              </p>
            </div>

            <div data-testid="privacy-section-retention">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t("4. Retention", "4. Retención")}</h2>
              <p>
                {t(
                  "We retain your data as long as you maintain an active account or as necessary to comply with legal and service obligations.",
                  "Conservamos tus datos mientras mantengas una cuenta activa o sea necesario para cumplir obligaciones legales y de servicio."
                )}
              </p>
            </div>

            <div data-testid="privacy-section-rights">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t("5. Your rights", "5. Tus derechos")}</h2>
              <p>
                {t(
                  "You may request access, update, or deletion of your personal data. To do so, contact us at support@venturafreshlaundry.com.",
                  "Puedes solicitar acceso, actualización o eliminación de tus datos personales. Para hacerlo, contáctanos en soporte@venturafreshlaundry.com."
                )}
              </p>
            </div>

            <div data-testid="privacy-section-security">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t("6. Security", "6. Seguridad")}</h2>
              <p>
                {t(
                  "We apply technical and organizational security measures to protect your information.",
                  "Aplicamos medidas de seguridad técnicas y organizativas para proteger tu información."
                )}
              </p>
            </div>

            <div data-testid="privacy-section-changes">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">{t("7. Changes to this policy", "7. Cambios en la política")}</h2>
              <p>
                {t(
                  "We will update this policy when necessary. The current version will be published on this page.",
                  "Actualizaremos esta política cuando sea necesario. Publicaremos la versión vigente en esta página."
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