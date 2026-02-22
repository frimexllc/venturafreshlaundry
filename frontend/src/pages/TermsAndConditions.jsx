import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

export default function TermsAndConditions() {
  return (
    <div className="min-h-screen bg-white" data-testid="terms-page">
      <PublicNav />

      <section className="pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-slate-900" data-testid="terms-title">
              Términos y Condiciones
            </h1>
            <p className="text-slate-500 mt-2" data-testid="terms-updated">
              Última actualización: 22 de febrero de 2026
            </p>
          </div>

          <div className="space-y-8 text-slate-700 leading-relaxed">
            <div data-testid="terms-section-acceptance">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Aceptación de los términos</h2>
              <p>
                Al acceder y utilizar los servicios de Ventura Fresh Laundry, aceptas cumplir con estos
                términos y condiciones. Si no estás de acuerdo, no utilices la plataforma.
              </p>
            </div>

            <div data-testid="terms-section-services">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Servicios</h2>
              <p>
                Ofrecemos servicios de lavandería, pickup, entrega, membresías y atención comercial.
                Los tiempos de servicio son estimados y pueden variar según demanda y capacidad operativa.
              </p>
            </div>

            <div data-testid="terms-section-payments">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Pagos y membresías</h2>
              <p>
                Los pagos se procesan de forma segura. Las membresías son recurrentes y se renovarán
                según el plan seleccionado hasta su cancelación. El cliente es responsable de mantener
                su información de pago actualizada.
              </p>
            </div>

            <div data-testid="terms-section-customer">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Responsabilidades del cliente</h2>
              <p>
                El cliente debe proporcionar información precisa sobre direcciones, accesos y preferencias.
                Las prendas deben estar preparadas para su recolección en el horario acordado.
              </p>
            </div>

            <div data-testid="terms-section-liability">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Limitación de responsabilidad</h2>
              <p>
                Ventura Fresh Laundry no será responsable por daños indirectos, pérdidas consecuenciales
                o retrasos causados por factores fuera de nuestro control razonable.
              </p>
            </div>

            <div data-testid="terms-section-changes">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Cambios en los términos</h2>
              <p>
                Podemos actualizar estos términos periódicamente. Las modificaciones se publicarán en
                esta página y se considerarán aceptadas al continuar usando el servicio.
              </p>
            </div>

            <div data-testid="terms-section-contact">
              <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Contacto</h2>
              <p>
                Para preguntas sobre estos términos, contáctanos en soporte@venturafreshlaundry.com.
              </p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
