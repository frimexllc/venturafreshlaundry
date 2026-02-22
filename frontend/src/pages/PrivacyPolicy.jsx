import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white" data-testid="privacy-page">
      <PublicNav />

      <section className="pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-slate-900" data-testid="privacy-title">
              Política de Privacidad
            </h1>
            <p className="text-slate-500 mt-2" data-testid="privacy-updated">
              Última actualización: 22 de febrero de 2026
            </p>
          </div>

          <div className="space-y-8 text-slate-700 leading-relaxed">
            <div data-testid="privacy-section-data">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Información que recopilamos</h2>
              <p>
                Recopilamos datos de contacto, direcciones, preferencias de servicio, historial de órdenes,
                y detalles necesarios para procesar pagos y entregas.
              </p>
            </div>

            <div data-testid="privacy-section-use">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Uso de la información</h2>
              <p>
                Usamos la información para operar el servicio, confirmar órdenes, enviar notificaciones,
                y mejorar la experiencia del cliente. No vendemos tu información a terceros.
              </p>
            </div>

            <div data-testid="privacy-section-sharing">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Compartición con terceros</h2>
              <p>
                Compartimos datos solo con proveedores necesarios para el servicio (por ejemplo, procesadores
                de pago y mensajería). Estos proveedores están obligados a proteger tu información.
              </p>
            </div>

            <div data-testid="privacy-section-retention">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Retención</h2>
              <p>
                Conservamos tus datos mientras mantengas una cuenta activa o sea necesario para cumplir
                obligaciones legales y de servicio.
              </p>
            </div>

            <div data-testid="privacy-section-rights">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Tus derechos</h2>
              <p>
                Puedes solicitar acceso, actualización o eliminación de tus datos personales. Para hacerlo,
                contáctanos en soporte@venturafreshlaundry.com.
              </p>
            </div>

            <div data-testid="privacy-section-security">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Seguridad</h2>
              <p>
                Aplicamos medidas de seguridad técnicas y organizativas para proteger tu información.
              </p>
            </div>

            <div data-testid="privacy-section-changes">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Cambios en la política</h2>
              <p>
                Actualizaremos esta política cuando sea necesario. Publicaremos la versión vigente en esta página.
              </p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
