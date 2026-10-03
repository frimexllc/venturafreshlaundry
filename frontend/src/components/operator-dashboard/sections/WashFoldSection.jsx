// WashFoldSection.jsx — Wash & Fold's own dashboard flow. Independent from
// Pickup & Delivery's and Sneaker Cleaning's sections.
import { Package, CheckCircle, DollarSign } from "lucide-react";
import { SectionNumber, CardHeader, EmptyState, OrderRow, PaymentQueueRow, isOrderUrgent } from "./SectionPrimitives";
import { getNextStatus } from "../utils";

export default function WashFoldSection({
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
            icon={<Package className="h-4 w-4" />}
            title={t("Wash & Fold — Created / Confirmed", "Wash & Fold — Creadas / Confirmadas")}
            count={stage1Orders.length}
            testId="pos-washfold-dropoff-count"
          />
          {stage1Orders.length === 0 ? (
            <EmptyState icon={<Package className="h-7 w-7" />} text={t("No created or confirmed orders", "Sin órdenes creadas o confirmadas")} testId="pos-washfold-dropoff-empty" />
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
                  advanceBtnClass="bg-purple-600 hover:bg-purple-700"
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
            title={t("Wash & Fold — Processing / Ready for pickup", "Wash & Fold — Procesando / Lista para recoger")}
            count={stage2Orders.length}
            testId="pos-washfold-ready-count"
          />
          {stage2Orders.length === 0 ? (
            <EmptyState icon={<CheckCircle className="h-7 w-7" />} text={t("No orders in process or ready", "Sin órdenes en proceso o listas")} testId="pos-washfold-ready-empty" />
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
            testId="pos-washfold-payment-count"
          />
          {paymentQueue.length === 0 ? (
            <EmptyState icon={<DollarSign className="h-7 w-7" />} text={t("No wash & fold payments pending", "Sin pagos pendientes")} testId="pos-washfold-payment-empty" />
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
                testIdPrefix="pos-washfold-payment"
                t={t}
                amountFallbackLabel={t("Set actual lbs", "Ingresa lbs reales")}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
