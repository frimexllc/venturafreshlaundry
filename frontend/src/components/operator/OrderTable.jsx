import { Button } from "../ui/button";
import { ChevronRight, RefreshCw } from "lucide-react";
import { formatOrderNumber } from "./utils";

export const OrderTable = ({ orders, updating, onAdvance, t }) => (
  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
    <table className="w-full text-left border-collapse">
      <thead className="bg-slate-50 border-b border-slate-100">
        <tr>
          <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">{t("ID", "Order")}</th>
          <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">{t("Cliente", "Customer")}</th>
          <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">{t("Acción", "Action")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {orders?.map((order) => (
          <tr key={order.id} className="hover:bg-slate-50/50 transition-colors group">
            <td className="px-6 py-4 font-mono font-bold text-sky-600 text-sm">
              {formatOrderNumber(order)}
            </td>
            <td className="px-6 py-4">
              <p className="text-sm font-semibold text-slate-800">{order.customer_name}</p>
              <p className="text-xs text-slate-400">{order.pickup_address}</p>
            </td>
            <td className="px-6 py-4 text-right">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onAdvance(order.id, order.status)}
                disabled={updating[order.id]}
                className="group-hover:translate-x-1 transition-transform"
              >
                {updating[order.id] ? <RefreshCw className="animate-spin h-4 w-4" /> : <ChevronRight size={18} />}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);