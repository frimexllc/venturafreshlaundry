import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  CreditCard, 
  Calendar,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Users,
  ShoppingBag
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Finances() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total_revenue: 0,
    total_orders: 0,
    paid_orders: 0,
    pending_orders: 0,
    avg_order_value: 0,
    total_memberships: 0,
    membership_revenue: 0
  });
  const [transactions, setTransactions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchFinanceData();
  }, [dateRange, filter]);

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      // Fetch orders
      const ordersRes = await axios.get(`${API}/orders`);
      const allOrders = ordersRes.data || [];
      
      // Filter by date range
      const filteredOrders = allOrders.filter(order => {
        const orderDate = new Date(order.created_at).toISOString().split('T')[0];
        return orderDate >= dateRange.start && orderDate <= dateRange.end;
      });

      // Apply payment filter
      let displayOrders = filteredOrders;
      if (filter === "paid") {
        displayOrders = filteredOrders.filter(o => o.payment_status === "paid");
      } else if (filter === "pending") {
        displayOrders = filteredOrders.filter(o => o.payment_status !== "paid");
      }

      setOrders(displayOrders);

      // Calculate stats
      const paidOrders = filteredOrders.filter(o => o.payment_status === "paid");
      const pendingOrders = filteredOrders.filter(o => o.payment_status !== "paid");
      const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const avgOrderValue = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

      // Fetch membership signups
      let membershipRevenue = 0;
      let totalMemberships = 0;
      try {
        const membershipsRes = await axios.get(`${API}/memberships/signups`);
        const memberships = membershipsRes.data || [];
        const paidMemberships = memberships.filter(m => m.payment_status === "paid");
        totalMemberships = paidMemberships.length;
        membershipRevenue = paidMemberships.reduce((sum, m) => sum + (m.amount || 0), 0);
      } catch (e) {
        // Memberships endpoint might not exist
      }

      // Fetch payment transactions
      try {
        const transactionsRes = await axios.get(`${API}/store/transactions`);
        setTransactions(transactionsRes.data || []);
      } catch (e) {
        setTransactions([]);
      }

      setStats({
        total_revenue: totalRevenue + membershipRevenue,
        total_orders: filteredOrders.length,
        paid_orders: paidOrders.length,
        pending_orders: pendingOrders.length,
        avg_order_value: avgOrderValue,
        total_memberships: totalMemberships,
        membership_revenue: membershipRevenue
      });

    } catch (error) {
      toast.error("Error loading financial data");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  const exportToCSV = () => {
    const headers = ["Order Number", "Customer", "Date", "Amount", "Payment Status", "Order Status"];
    const rows = orders.map(o => [
      o.order_number || o.id,
      o.customer_name || "N/A",
      formatDate(o.created_at),
      o.total_amount || 0,
      o.payment_status || "pending",
      o.status || "new"
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finances-${dateRange.start}-to-${dateRange.end}.csv`;
    a.click();
    toast.success("Report exported");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="h-7 w-7 text-green-600" />
            Finances
          </h1>
          <p className="text-slate-500 mt-1">Revenue tracking and financial reports</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchFinanceData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={exportToCSV} className="bg-green-600 hover:bg-green-700">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <Label>Start Date</Label>
            <Input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
              className="mt-1"
            />
          </div>
          <div>
            <Label>End Date</Label>
            <Input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Payment Status</Label>
            <select
              className="h-9 rounded-md border border-slate-200 px-3 text-sm mt-1 w-full"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="paid">Paid Only</option>
              <option value="pending">Pending Only</option>
            </select>
          </div>
          <Button variant="outline" onClick={() => {
            const today = new Date();
            setDateRange({
              start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
              end: today.toISOString().split('T')[0]
            });
          }}>
            This Month
          </Button>
          <Button variant="outline" onClick={() => {
            const today = new Date();
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            setDateRange({
              start: lastMonth.toISOString().split('T')[0],
              end: new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0]
            });
          }}>
            Last Month
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Revenue */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Revenue</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {formatCurrency(stats.total_revenue)}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-sm text-green-600">
                <TrendingUp className="h-4 w-4" />
                <span>Orders + Memberships</span>
              </div>
            </div>

            {/* Paid Orders */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Paid Orders</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{stats.paid_orders}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-sky-100 flex items-center justify-center">
                  <CreditCard className="h-6 w-6 text-sky-600" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-sm text-slate-500">
                <ShoppingBag className="h-4 w-4" />
                <span>of {stats.total_orders} total orders</span>
              </div>
            </div>

            {/* Pending Payments */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Pending Payments</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">{stats.pending_orders}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                  <Receipt className="h-6 w-6 text-orange-600" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-sm text-orange-600">
                <ArrowUpRight className="h-4 w-4" />
                <span>Awaiting payment</span>
              </div>
            </div>

            {/* Avg Order Value */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Avg Order Value</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {formatCurrency(stats.avg_order_value)}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-sm text-slate-500">
                <Users className="h-4 w-4" />
                <span>{stats.total_memberships} memberships</span>
              </div>
            </div>
          </div>

          {/* Revenue Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue by Source */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Revenue Breakdown</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-sky-100 flex items-center justify-center">
                      <ShoppingBag className="h-5 w-5 text-sky-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Order Revenue</p>
                      <p className="text-sm text-slate-500">{stats.paid_orders} paid orders</p>
                    </div>
                  </div>
                  <p className="font-bold text-slate-900">
                    {formatCurrency(stats.total_revenue - stats.membership_revenue)}
                  </p>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Membership Revenue</p>
                      <p className="text-sm text-slate-500">{stats.total_memberships} memberships</p>
                    </div>
                  </div>
                  <p className="font-bold text-slate-900">{formatCurrency(stats.membership_revenue)}</p>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Period Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-600">Date Range</span>
                  <span className="font-medium">{formatDate(dateRange.start)} - {formatDate(dateRange.end)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-600">Total Orders</span>
                  <span className="font-medium">{stats.total_orders}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-600">Conversion Rate</span>
                  <span className="font-medium">
                    {stats.total_orders > 0 ? Math.round((stats.paid_orders / stats.total_orders) * 100) : 0}%
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-600 font-semibold">Total Revenue</span>
                  <span className="font-bold text-green-600">{formatCurrency(stats.total_revenue)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-semibold text-slate-900">
                Order Transactions ({orders.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Order</th>
                    <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Customer</th>
                    <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Amount</th>
                    <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Payment</th>
                    <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        No orders in this period
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <p className="font-mono font-medium text-slate-900">
                            {order.order_number || order.id.slice(0, 8)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-slate-900">{order.customer_name || "N/A"}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-slate-600">{formatDate(order.created_at)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-900">{formatCurrency(order.total_amount)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            order.payment_status === "paid" 
                              ? "bg-green-100 text-green-700" 
                              : "bg-orange-100 text-orange-700"
                          }`}>
                            {order.payment_status === "paid" ? "Paid" : "Pending"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            order.status === "completed" 
                              ? "bg-green-100 text-green-700"
                              : order.status === "cancelled"
                              ? "bg-red-100 text-red-700" 
                              : "bg-sky-100 text-sky-700"
                          }`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
