import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { StripePaymentModal } from './StripePaymentModal';
import { MapPin, Phone, Mail, Calendar, Clock, Package, CreditCard, AlertCircle, CheckCircle, Truck, FileText, ChevronRight, ChevronLeft, Zap } from 'lucide-react';
import { ORDER_TYPE_LABELS, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../../utils/orders';

const STATUS_FLOW = ['pending', 'picked-up', 'in-process', 'ready', 'shipping', 'delivered'];

const STATUS_ICONS = {
  pending: <Clock className="w-3.5 h-3.5" />,
  'picked-up': <Package className="w-3.5 h-3.5" />,
  'in-process': <Truck className="w-3.5 h-3.5" />,
  ready: <CheckCircle className="w-3.5 h-3.5" />,
  shipping: <Truck className="w-3.5 h-3.5" />,
  delivered: <CheckCircle className="w-3.5 h-3.5" />,
};

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'picked-up': 'bg-blue-100 text-blue-800 border-blue-200',
  'in-process': 'bg-purple-100 text-purple-800 border-purple-200',
  ready: 'bg-green-100 text-green-800 border-green-200',
  shipping: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  delivered: 'bg-gray-100 text-gray-800 border-gray-200',
};

const STATUS_STEP_ACTIVE = {
  pending: 'bg-yellow-500 text-white ring-2 ring-yellow-300',
  'picked-up': 'bg-blue-500 text-white ring-2 ring-blue-300',
  'in-process': 'bg-purple-500 text-white ring-2 ring-purple-300',
  ready: 'bg-green-500 text-white ring-2 ring-green-300',
  shipping: 'bg-indigo-500 text-white ring-2 ring-indigo-300',
  delivered: 'bg-gray-700 text-white ring-2 ring-gray-400',
};

export function OrderDetailsModal({ order, open, onClose, onStatusChange, onPaymentSuccess }) {
  const [stripeOpen, setStripeOpen] = useState(false);
  if (!order) return null;

  const phoneClean = (order.customer?.phone || '').replace(/[^+\d]/g, '');
  const currentIdx = STATUS_FLOW.indexOf(order.status);
  const canAdvance = currentIdx < STATUS_FLOW.length - 1;
  const canRetreat = currentIdx > 0;
  const nextStatus = canAdvance ? STATUS_FLOW[currentIdx + 1] : null;
  const prevStatus = canRetreat ? STATUS_FLOW[currentIdx - 1] : null;

  const getPaymentStatusColor = (s) => s === 'paid' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200';
  const requiresPayment = order.payment?.status === 'pending' && (order.status === 'ready' || order.status === 'shipping');

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="order-details-modal">
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <DialogTitle className="text-2xl">Orden {order.orderNumber}</DialogTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={STATUS_COLORS[order.status]}>{ORDER_STATUS_LABELS[order.status] || order.status}</Badge>
              {onStatusChange && (
                <div className="flex items-center gap-1">
                  <button disabled={!canRetreat} onClick={() => prevStatus && onStatusChange(prevStatus)} data-testid="status-prev-btn" className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button disabled={!canAdvance} onClick={() => nextStatus && onStatusChange(nextStatus)} data-testid="status-next-btn" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    Avanzar <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
          <DialogDescription>{ORDER_TYPE_LABELS[order.type] || order.type} - {order.customer?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Tipo de Servicio</h3>
            <p className="text-lg">{ORDER_TYPE_LABELS[order.type] || order.type}</p>
          </div>
          <Separator />
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-3">Informacion del Cliente</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2"><Package className="w-4 h-4 text-gray-400" /><span>{order.customer?.name}</span></div>
              {order.customer?.phone && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="flex-1">{order.customer.phone}</span>
                  <a href={`tel:${phoneClean}`} data-testid="call-btn" className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"><Phone className="w-3 h-3" /> Llamar</a>
                  <a href={`sms:${phoneClean}`} data-testid="sms-btn" className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"><Mail className="w-3 h-3" /> SMS</a>
                </div>
              )}
              {order.customer?.email && (
                <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /><a href={`mailto:${order.customer.email}`} className="text-blue-600 hover:underline">{order.customer.email}</a></div>
              )}
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                <div><p>{order.location?.address}</p>{order.location?.zipCode && <p className="text-sm text-gray-500">CP: {order.location.zipCode}</p>}</div>
              </div>
            </div>
          </div>
          <Separator />
          {order.service && (
            <>
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Detalles del Servicio</h3>
                <div className="space-y-2">
                  {order.service.weight && <div className="flex items-center gap-2"><span className="text-sm text-gray-500">Peso:</span><span className="font-medium">{order.service.weight} lb</span></div>}
                  {order.service.items && <div><span className="text-sm text-gray-500 block mb-1">Articulos:</span><ul className="list-disc list-inside space-y-1">{order.service.items.map((item, i) => <li key={i} className="text-sm">{item}</li>)}</ul></div>}
                  {order.service.preferences && <div><span className="text-sm text-gray-500 block mb-1">Preferencias:</span><p className="text-sm">{order.service.preferences}</p></div>}
                </div>
              </div>
              <Separator />
            </>
          )}
          {order.specialInstructions && (
            <>
              <div><h3 className="text-sm font-medium text-gray-500 mb-2">Instrucciones Especiales</h3><p className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">{order.specialInstructions}</p></div>
              <Separator />
            </>
          )}
          {order.schedule && (
            <>
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Programacion</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1"><Calendar className="w-4 h-4 text-gray-400" /><span className="text-sm font-medium">Recoleccion</span></div>
                    <p className="text-sm">{order.schedule.pickupDate}</p>
                    {order.schedule.pickupTime && <div className="flex items-center gap-1 mt-1"><Clock className="w-3 h-3 text-gray-400" /><p className="text-xs text-gray-500">{order.schedule.pickupTime}</p></div>}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1"><Truck className="w-4 h-4 text-gray-400" /><span className="text-sm font-medium">Entrega</span></div>
                    <p className="text-sm">{order.schedule.deliveryDate}</p>
                    {order.schedule.deliveryTime && <div className="flex items-center gap-1 mt-1"><Clock className="w-3 h-3 text-gray-400" /><p className="text-xs text-gray-500">{order.schedule.deliveryTime}</p></div>}
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-3">Desglose de Precios</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm"><span>Subtotal:</span><span>${order.pricing?.subtotal?.toFixed(2) || '0.00'}</span></div>
              <div className="flex justify-between text-sm"><span>Impuestos (7.75%):</span><span>${order.pricing?.tax?.toFixed(2) || '0.00'}</span></div>
              <Separator />
              <div className="flex justify-between font-semibold text-lg"><span>TOTAL:</span><span>${order.pricing?.total?.toFixed(2) || '0.00'}</span></div>
            </div>
          </div>
          <Separator />
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-3">Informacion de Pago</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-gray-400" />
                  <span className="text-sm">{PAYMENT_METHOD_LABELS[order.payment?.method] || order.payment?.method}</span>
                  {order.payment?.lastFour && <span className="text-xs text-gray-500">****{order.payment.lastFour}</span>}
                </div>
                <Badge className={getPaymentStatusColor(order.payment?.status)}>{order.payment?.status === 'paid' ? 'Pagado' : 'Pendiente'}</Badge>
              </div>
              {order.payment?.status !== 'paid' && (
                <button onClick={() => setStripeOpen(true)} data-testid="stripe-charge-btn" className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors shadow-md shadow-blue-200">
                  <Zap className="w-4 h-4" /> Cobrar ${order.pricing?.total?.toFixed(2) || '0.00'} con Stripe
                  <span className="text-[10px] font-normal opacity-80 ml-0.5">Apple Pay / Google Pay / Card</span>
                </button>
              )}
              {order.payment?.status === 'paid' && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 font-semibold text-sm">
                  <CheckCircle className="w-4 h-4" /> Pago confirmado - ${order.pricing?.total?.toFixed(2) || '0.00'}
                </div>
              )}
              {requiresPayment && order.payment?.status !== 'paid' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-red-900 mb-1">Pago Requerido</h4>
                      <p className="text-sm text-red-700">Esta orden requiere confirmacion de pago antes de ser enviada.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-500">Proceso de Operacion</h3>
              {onStatusChange && <span className="text-[10px] text-gray-400">Haz clic para cambiar estado</span>}
            </div>
            <div className="space-y-2">
              {STATUS_FLOW.map((stepStatus, index) => {
                const isActive = order.status === stepStatus;
                const isPast = currentIdx > index;
                const isFuture = currentIdx < index;
                return (
                  <div key={stepStatus} className="flex items-center gap-3">
                    <button
                      onClick={() => onStatusChange && onStatusChange(stepStatus)}
                      disabled={isActive || !onStatusChange}
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${isActive ? STATUS_STEP_ACTIVE[stepStatus] : isPast ? 'bg-green-500 text-white hover:scale-105' : onStatusChange ? 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 cursor-pointer hover:scale-105' : 'bg-gray-200 text-gray-400'}`}
                    >
                      {isPast ? <CheckCircle className="w-4 h-4" /> : isActive ? STATUS_ICONS[stepStatus] : <span className="text-xs">{index + 1}</span>}
                    </button>
                    <div className="flex-1 flex items-center justify-between">
                      <span className={`text-sm ${isActive ? 'font-bold text-gray-900' : isPast ? 'text-gray-500' : 'text-gray-400'}`}>{ORDER_STATUS_LABELS[stepStatus]}</span>
                      {isActive && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">ACTUAL</span>}
                      {isFuture && onStatusChange && <button onClick={() => onStatusChange(stepStatus)} className="text-[10px] text-blue-500 hover:text-blue-700 hover:underline">Ir aqui</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <FileText className="w-3 h-3" />
            <span>Creado el {new Date(order.createdAt).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </DialogContent>
      <StripePaymentModal order={order} open={stripeOpen} onClose={() => setStripeOpen(false)} onPaymentSuccess={() => { setStripeOpen(false); onPaymentSuccess?.(order.id); }} />
    </Dialog>
  );
}