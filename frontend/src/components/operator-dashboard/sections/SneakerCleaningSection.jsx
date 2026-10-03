// SneakerCleaningSection.jsx — Sneaker Cleaning's own dashboard flow.
// Independent from Pickup & Delivery's and Wash & Fold's sections.
import { Footprints, CheckCircle, DollarSign } from "lucide-react";
import { SectionNumber, CardHeader, EmptyState, OrderRow, PaymentQueueRow, isOrderUrgent } from "./SectionPrimitives";
import { getNextStatus } from "../utils";

export default function SneakerCleaningSection({
  stage1Orders,
  stage2Orders,
  paymentQueue,
  updating,
  getStatusInfo,
  onRowClick,
  onAdvance,
  onPrint,
  onPDF,
  onCollect,
  t,
}) {
  return (
    <div className="space-y-4">
      {/* ── 1. Created / Confirmed ── */}
      <div className="flex items-start gap-2 sm:gap-4">
        <SectionNumber number="1" />
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <CardHeader
            icon={<Footprints className="h-4 w-4" />}
            title={t("Sneaker Cleaning — Created / Confirmed", "Sneaker Cleaning — Creadas / Confirmadas")}
            count={stage1Orders.length}
            testId="pos-sneaker-today-count"
          />
          {stage1Orders.length === 0 ? (
            <EmptyState icon={<Footprints className="h-7 w-7" />} text={t("No created or confirmed orders", "No hay órdenes creadas o confirmadas")} testId="pos-sneaker-today-empty" />
          ) : (
            stage1Orders.map((order) => {
              const ns = getNextStatus(order.status, order.service_type);
              return (
                <OrderRow
                  key={order.order_id ?? order.order_number}
                  order={order}
                  statusInfo={getStatusInfo(order.status, order.service_type)}
                  nextStatus={ns}
                  nextStatusInfo={ns ? getStatusInfo(ns, order.service_type) : null}
                  updating={updating}
                  onRowClick={onRowClick}
                  onAdvance={onAdvance}
                  onPrint={onPrint}
                  onPDF={onPDF}
                  showPrint
                  urgent={isOrderUrgent(order)}
                  advanceBtnClass="bg-violet-600 hover:bg-violet-700"
                  t={t}
                />
              );
            })
          )}
        </div>
      </div>

      {/* ── 2. Processing / Ready ── */}
      <div className="flex items-start gap-2 sm:gap-4">
        <SectionNumber number="2" />
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <CardHeader
            icon={<CheckCircle className="h-4 w-4" />}
            title={t("Sneaker Cleaning — Processing / Ready", "Sneaker Cleaning — Procesando / Lista")}
            count={stage2Orders.length}
            testId="pos-sneaker-ready-count"
          />
          {stage2Orders.length === 0 ? (
            <EmptyState icon={<CheckCircle className="h-7 w-7" />} text={t("No orders in process or ready", "Sin órdenes en proceso o listas")} testId="pos-sneaker-ready-empty" />
          ) : (
            stage2Orders.map((order) => {
              const ns = getNextStatus(order.status, order.service_type);
              return (
                <OrderRow
                  key={order.order_id ?? order.order_number}
                  order={order}
                  statusInfo={getStatusInfo(order.status, order.service_type)}
                  nextStatus={ns}
                  nextStatusInfo={ns ? getStatusInfo(ns, order.service_type) : null}
                  updating={updating}
                  onRowClick={onRowClick}
                  onAdvance={onAdvance}
                  onPrint={onPrint}
                  onPDF={onPDF}
                  showPrint
                  urgent={isOrderUrgent(order)}
                  advanceBtnClass="bg-emerald-600 hover:bg-emerald-700"
                  t={t}
                />
              );
            })
          )}
        </div>
      </div>

      {/* ── 3. Request Payment ── */}
      <div className="flex items-start gap-2 sm:gap-4">
        <div className="shrink-0 w-9 sm:w-14" />
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <CardHeader
            icon={<DollarSign className="h-4 w-4" />}
            title={t("Request Payment", "Solicitar pago")}
            count={paymentQueue.length}
            testId="pos-sneaker-payment-count"
          />
          {paymentQueue.length === 0 ? (
            <EmptyState icon={<DollarSign className="h-7 w-7" />} text={t("No sneaker cleaning payments pending", "Sin pagos pendientes")} testId="pos-sneaker-payment-empty" />
          ) : (
            paymentQueue.map((order) => (
              <PaymentQueueRow
                key={order.order_id ?? order.order_number}
                order={order}
                statusInfo={getStatusInfo(order.status, order.service_type)}
                onRowClick={onRowClick}
                onPrint={onPrint}
                onPDF={onPDF}
                onCollect={onCollect}
                testIdPrefix="pos-sneaker-payment"
                t={t}
                amountFallbackLabel={t("Pending", "Pendiente")}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
