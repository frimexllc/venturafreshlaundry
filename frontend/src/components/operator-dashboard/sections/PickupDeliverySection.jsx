// PickupDeliverySection.jsx — Pickup & Delivery's own dashboard flow.
// Independent from Wash & Fold's and Sneaker Cleaning's sections: its own
// stages, labels, colors and empty-state copy, not a generic component
// parameterized by service type.
import { Truck, Package, CheckCircle, DollarSign } from "lucide-react";
import { SectionNumber, CardHeader, EmptyState, OrderRow, PaymentQueueRow, isOrderUrgent } from "./SectionPrimitives";
import { getNextStatus } from "../utils";

export default function PickupDeliverySection({
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
            icon={<Truck className="h-4 w-4" />}
            title={t("Pickup & Delivery — Created / Confirmed", "Pickup & Delivery — Creadas / Confirmadas")}
            count={stage1Orders.length}
            testId="pos-pickup-today-count"
          />
          {stage1Orders.length === 0 ? (
            <EmptyState icon={<Truck className="h-7 w-7" />} text={t("No created or confirmed orders", "No hay órdenes creadas o confirmadas")} testId="pos-pickup-today-empty" />
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
                  advanceBtnClass="bg-sky-600 hover:bg-sky-700"
                  t={t}
                />
              );
            })
          )}
        </div>
      </div>

      {/* ── 2. In Process / Ready / Out for Delivery ── */}
      <div className="flex items-start gap-2 sm:gap-4">
        <SectionNumber number="2" />
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <CardHeader
            icon={<CheckCircle className="h-4 w-4" />}
            title={t("Pickup & Delivery — In Process / Ready / Out for Delivery", "Pickup & Delivery — En proceso / Lista / En camino")}
            count={stage2Orders.length}
            testId="pos-pickup-delivery-count"
          />
          {stage2Orders.length === 0 ? (
            <EmptyState icon={<Package className="h-7 w-7" />} text={t("No active process or delivery orders", "No hay órdenes en proceso o entrega")} testId="operator-delivery-empty" />
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
            testId="pos-pickup-payment-count"
          />
          {paymentQueue.length === 0 ? (
            <EmptyState icon={<DollarSign className="h-7 w-7" />} text={t("No pickup payments pending", "Sin pagos pendientes")} testId="pos-pickup-payment-empty" />
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
                testIdPrefix="pos-pickup-payment"
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
