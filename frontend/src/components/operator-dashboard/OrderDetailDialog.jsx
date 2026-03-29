import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { safeString, formatCurrency, formatOrderNumber } from "./utils";

export default function OrderDetailDialog({ order, onClose, onRefresh }) {
  if (!order) return null;

  return (
    <Dialog open={!!order} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="order-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Orden {formatOrderNumber(order)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">Cliente</span>
              <p className="font-medium">{safeString(order.customer_name, "N/A")}</p>
            </div>
            <div>
              <span className="text-slate-500">Telefono</span>
              <p className="font-medium">{safeString(order.customer_phone, "N/A")}</p>
            </div>
            <div>
              <span className="text-slate-500">Email</span>
              <p className="font-medium">{safeString(order.customer_email, "N/A")}</p>
            </div>
            <div>
              <span className="text-slate-500">Servicio</span>
              <p className="font-medium">{safeString(order.service_type, "N/A")}</p>
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500">Estado</span>
              <Badge variant="outline">{safeString(order.status)}</Badge>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500">Pago</span>
              <Badge variant={order.payment_status === "paid" ? "default" : "destructive"}>
                {safeString(order.payment_status, "pending")}
              </Badge>
            </div>
            {order.total_amount != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Total</span>
                <span className="font-bold text-lg">{formatCurrency(order.total_amount || order.total)}</span>
              </div>
            )}
          </div>

          {order.pickup_address && (
            <div className="border-t pt-3">
              <span className="text-sm text-slate-500">Direccion Pickup</span>
              <p className="text-sm font-medium mt-1">{order.pickup_address}</p>
            </div>
          )}

          {order.delivery_address && (
            <div>
              <span className="text-sm text-slate-500">Direccion Delivery</span>
              <p className="text-sm font-medium mt-1">{order.delivery_address}</p>
            </div>
          )}

          {order.special_instructions && (
            <div className="border-t pt-3">
              <span className="text-sm text-slate-500">Instrucciones Especiales</span>
              <p className="text-sm mt-1 bg-yellow-50 p-2 rounded">{order.special_instructions}</p>
            </div>
          )}

          {order.items && order.items.length > 0 && (
            <div className="border-t pt-3">
              <span className="text-sm text-slate-500 mb-2 block">Items</span>
              <div className="space-y-1">
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm bg-slate-50 px-3 py-1.5 rounded">
                    <span>{safeString(item.name || item.product_name)}</span>
                    <span className="font-medium">{item.quantity} x {formatCurrency(item.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button variant="outline" className="w-full mt-2" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
