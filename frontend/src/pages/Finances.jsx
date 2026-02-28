import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import {
  DollarSign,
  CreditCard,
  Receipt,
  TrendingUp,
  Users,
  ShoppingBag,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const defaultSummary = {
  total_revenue: 0,
  order_revenue: 0,
  membership_revenue: 0,
  store_revenue: 0,
  total_orders: 0,
  paid_orders: 0,
  pending_orders: 0,
  store_orders: 0,
  store_paid_orders: 0,
  store_pending_orders: 0,
  avg_order_value: 0,
  total_memberships: 0,
  payment_methods: {}
};

export default function Finances() {
  const { t, locale } = useLocale();
  const [summary, setSummary] = useState(defaultSummary);
  const [transactions, setTransactions] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0]
  });
  const [paymentFilter, setPaymentFilter] = useState("all");

  useEffect(() => {
    fetchSummary();
    fetchTransactions();
  }, [dateRange, paymentFilter]);

  const fetchSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await axios.get(`${API}/finances/summary`, {
        params: { start_date: dateRange.start, end_date: dateRange.end }
      });
      setSummary({ ...defaultSummary, ...res.data });
    } catch (error) {
      toast.error(t("Error loading financial summary", "Error cargando resumen financiero"));
      setSummary(defaultSummary);
    } finally {
      setLoadingSummary(false);
    }
  };

  const fetchTransactions = async () => {
    setLoadingTransactions(true);
    try {
      const res = await axios.get(`${API}/store/transactions`);
      const data = res.data || [];

      const filtered = data
        .filter((transaction) => {
          if (!transaction.created_at) return false;
          const txDate = new Date(transaction.created_at).toISOString().split("T")[0];
          return txDate >= dateRange.start && txDate <= dateRange.end;
        })
        .filter((transaction) => {
          if (paymentFilter === "paid") {
            return (transaction.payment_status || "").toLowerCase() === "paid";
          }
          if (paymentFilter === "pending") {
            return (transaction.payment_status || "").toLowerCase() !== "paid";
          }
          return true;
        })
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      setTransactions(filtered);
    } catch (error) {
      toast.error(t("Error loading transactions", "Error cargando transacciones"));
      setTransactions([]);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const refreshAll = () => {
    fetchSummary();
    fetchTransactions();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const csvEscape = (value) => {
    const safe = `${value ?? ""}`.replace(/"/g, '""');
    return `"${safe}"`;
  };

  const exportToCSV = () => {
    if (!transactions.length) {
      toast.error(t("No transactions to export", "No hay transacciones para exportar"));
      return;
    }

    const headers = [
      t("Date", "Fecha"),
      t("Type", "Tipo"),
      t("Reference", "Referencia"),
      t("Customer", "Cliente"),
      t("Amount", "Monto"),
      t("Status", "Estado")
    ];
    const rows = transactions.map((transaction) => [
      formatDate(transaction.created_at),
      transaction.payment_type || "service",
      transaction.order_number || transaction.order_id || transaction.session_id || "-",
      transaction.customer_email || transaction.customer_name || "-",
      transaction.amount || 0,
      transaction.payment_status || "pending"
    ]);

    const csv = [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finances-${dateRange.start}-to-${dateRange.end}.csv`;
    a.click();
    toast.success(t("Report exported", "Reporte exportado"));
  };

  return (
    <div data-testid="finances-page" className="space-y-6 bg-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2" data-testid="finances-title">
            <DollarSign className="h-7 w-7 text-green-600" />
            {t("Finances", "Finanzas")}
          </h1>
          <p className="text-slate-500 mt-1" data-testid="finances-subtitle">
            {t("Financial summary and transactions for the period", "Resumen financiero y movimientos del periodo")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshAll} data-testid="finances-refresh-button">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("Refresh", "Actualizar")}
          </Button>
          <Button onClick={exportToCSV} className="bg-green-600 hover:bg-green-700" data-testid="finances-export-button">
            <Download className="h-4 w-4 mr-2" />
            {t("Export CSV", "Exportar CSV")}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4" data-testid="finances-filters">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <Label>{t("Start", "Inicio")}</Label>
            <Input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="mt-1"
              data-testid="finances-start-date"
            />
          </div>
          <div>
            <Label>{t("End", "Fin")}</Label>
            <Input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="mt-1"
              data-testid="finances-end-date"
            />
          </div>
          <div>
            <Label>{t("Payment", "Pago")}</Label>
            <select
              className="h-9 rounded-md border border-slate-200 px-3 text-sm mt-1 w-full"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              data-testid="finances-payment-filter"
            >
              <option value="all">{t("All", "Todos")}</option>
              <option value="paid">{t("Paid", "Pagados")}</option>
              <option value="pending">{t("Pending", "Pendientes")}</option>
            </select>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const today = new Date();
              setDateRange({
                start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0],
                end: today.toISOString().split("T")[0]
              });
            }}
            data-testid="finances-this-month"
          >
            {t("This month", "Este mes")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const today = new Date();
              const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
              setDateRange({
                start: lastMonth.toISOString().split("T")[0],
                end: new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split("T")[0]
              });
            }}
            data-testid="finances-last-month"
          >
            {t("Last month", "Mes pasado")}
          </Button>
        </div>
      </div>

      {loadingSummary ? (
        <div className="flex items-center justify-center py-12" data-testid="finances-loading">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-6" data-testid="finances-total-revenue-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{t("Total Revenue", "Ingresos totales")}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1" data-testid="finances-total-revenue">
                    {formatCurrency(summary.total_revenue)}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-sm text-green-600">
                <TrendingUp className="h-4 w-4" />
                <span>{t("Period total", "Total del periodo")}</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6" data-testid="finances-membership-revenue-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{t("Membership Revenue", "Ingresos membresías")}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1" data-testid="finances-membership-revenue">
                    {formatCurrency(summary.membership_revenue)}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-purple-600" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-sm text-slate-500">
                <ArrowUpRight className="h-4 w-4" />
                <span>{t("{count} paid memberships", "{count} membresías pagadas").replace("{count}", summary.total_memberships)}</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6" data-testid="finances-paid-orders-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{t("Paid Orders", "Órdenes pagadas")}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1" data-testid="finances-paid-orders">
                    {summary.paid_orders}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-sky-100 flex items-center justify-center">
                  <CreditCard className="h-6 w-6 text-sky-600" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-sm text-slate-500">
                <ShoppingBag className="h-4 w-4" />
                <span>{t("of {total} orders", "de {total} órdenes").replace("{total}", summary.total_orders)}</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6" data-testid="finances-pending-orders-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{t("Pending Orders", "Órdenes pendientes")}</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1" data-testid="finances-pending-orders">
                    {summary.pending_orders}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                  <Receipt className="h-6 w-6 text-orange-600" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-sm text-orange-600">
                <ArrowDownRight className="h-4 w-4" />
                <span>{t("To be collected", "Por cobrar")}</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6" data-testid="finances-avg-order-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{t("Average Order Value", "Ticket promedio")}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1" data-testid="finances-avg-order-value">
                    {formatCurrency(summary.avg_order_value)}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-sm text-slate-500">
                <Users className="h-4 w-4" />
                <span>{t("{count} orders", "{count} órdenes").replace("{count}", summary.total_orders)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6" data-testid="finances-revenue-breakdown">
              <h3 className="font-semibold text-slate-900 mb-4">{t("Revenue Breakdown", "Distribución de ingresos")}</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-sky-100 flex items-center justify-center">
                      <ShoppingBag className="h-5 w-5 text-sky-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{t("Services", "Servicios")}</p>
                      <p className="text-sm text-slate-500">{t("{count} paid orders", "{count} órdenes pagadas").replace("{count}", summary.paid_orders)}</p>
                    </div>
                  </div>
                  <p className="font-bold text-slate-900" data-testid="finances-order-revenue">
                    {formatCurrency(summary.order_revenue)}
                  </p>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{t("Memberships", "Membresías")}</p>
                      <p className="text-sm text-slate-500">{t("{count} active", "{count} activas").replace("{count}", summary.total_memberships)}</p>
                    </div>
                  </div>
                  <p className="font-bold text-slate-900" data-testid="finances-membership-breakdown">
                    {formatCurrency(summary.membership_revenue)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6" data-testid="finances-period-summary">
              <h3 className="font-semibold text-slate-900 mb-4">{t("Period Summary", "Resumen del periodo")}</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-600">{t("Range", "Rango")}</span>
                  <span className="font-medium" data-testid="finances-date-range">{formatDate(dateRange.start)} - {formatDate(dateRange.end)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-600">{t("Orders", "Órdenes")}</span>
                  <span className="font-medium" data-testid="finances-total-orders">{summary.total_orders}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-600">{t("Conversion", "Conversión")}</span>
                  <span className="font-medium" data-testid="finances-conversion-rate">
                    {summary.total_orders > 0 ? Math.round((summary.paid_orders / summary.total_orders) * 100) : 0}%
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-600 font-semibold">{t("Total", "Total")}</span>
                  <span className="font-bold text-green-600" data-testid="finances-period-total">{formatCurrency(summary.total_revenue)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="finances-transactions-table">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-semibold text-slate-900">
            {t("Transactions ({count})", "Transacciones ({count})").replace("{count}", transactions.length)}
          </h3>
        </div>
        {loadingTransactions ? (
          <div className="flex items-center justify-center py-12" data-testid="finances-transactions-loading">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Date", "Fecha")}</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Type", "Tipo")}</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Reference", "Referencia")}</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Customer", "Cliente")}</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Amount", "Monto")}</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">{t("Status", "Estado")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-500" data-testid="finances-no-transactions">
                      {t("No transactions in this period", "No hay transacciones en este periodo")}
                    </td>
                  </tr>
                ) : (
                  transactions.map((transaction) => {
                    const paymentStatus = (transaction.payment_status || "").toLowerCase();
                    return (
                      <tr key={transaction.id} className="hover:bg-slate-50" data-testid={`transaction-row-${transaction.id}`}>
                        <td className="px-6 py-4">
                          <p className="text-slate-600" data-testid={`transaction-date-${transaction.id}`}>{formatDate(transaction.created_at)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-900" data-testid={`transaction-type-${transaction.id}`}>
                            {transaction.payment_type || "service"}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-mono text-sm text-slate-700" data-testid={`transaction-ref-${transaction.id}`}>
                            {transaction.order_number || transaction.order_id || transaction.session_id || "-"}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-slate-900" data-testid={`transaction-customer-${transaction.id}`}>
                            {transaction.customer_email || transaction.customer_name || "-"}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-900" data-testid={`transaction-amount-${transaction.id}`}>
                            {formatCurrency(transaction.amount)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${
                              paymentStatus === "paid"
                                ? "bg-green-100 text-green-700"
                                : "bg-orange-100 text-orange-700"
                            }`}
                            data-testid={`transaction-status-${transaction.id}`}
                          >
                            {paymentStatus === "paid" ? t("Paid", "Pagado") : t("Pending", "Pendiente")}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}