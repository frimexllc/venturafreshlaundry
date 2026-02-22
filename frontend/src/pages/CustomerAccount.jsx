import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { User, Mail, MapPin, Package, LogOut, Calendar, Clock } from "lucide-react";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  new: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-700",
  ready: "bg-purple-100 text-purple-700",
  out_for_delivery: "bg-orange-100 text-orange-700",
  delivered: "bg-green-100 text-green-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const statusLabels = {
  new: "New",
  processing: "Processing",
  ready: "Ready",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function CustomerAccount() {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState({
    detergent_type: "",
    water_temperature: "",
    fabric_softener: "",
    folding_style: "",
    hanging_instructions: "",
    allergies: "",
    special_instructions: "",
    pickup_time_preference: "",
    gate_code: ""
  });
  const [preferencesMeta, setPreferencesMeta] = useState({ updated_at: null, version: null });
  const [preferencesLoading, setPreferencesLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("customer_token");
    const customerData = localStorage.getItem("customer_data");

    if (!token) {
      navigate("/account/login");
      return;
    }

    if (customerData) {
      setCustomer(JSON.parse(customerData));
    }

    fetchOrders(token);
    fetchPreferences(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const fetchOrders = async (token) => {
    try {
      const res = await axios.get(`${API}/customer/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(res.data || []);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      if (error.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("customer_token");
    localStorage.removeItem("customer_data");
    toast.success("Signed out successfully");
    navigate("/account/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <PublicNav />
        <div className="pt-40 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicNav />

      {/* 👇 empuja el contenido hacia abajo para que no se encime con el nav */}
      <section className="pt-40 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* ✅ CARD BAJADA EXTRA */}
          <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100 mb-6 mt-10 md:mt-14">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center">
                  <User className="h-7 w-7 text-sky-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    Hi, {customer?.name?.split(" ")[0] || "Customer"}
                  </h1>
                  <p className="text-slate-500 text-sm">{customer?.email}</p>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={handleLogout}
                className="text-slate-600 hover:text-red-600 hover:border-red-200"
                data-testid="customer-logout-btn"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </div>
          </div>

          {/* Orders Section */}
          <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Package className="h-5 w-5 text-sky-600" />
                Orders
              </h2>
              <Link to="/schedule-pickup">
                <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full text-sm">
                  New Pickup
                </Button>
              </Link>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Package className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-slate-600 mb-4">No orders yet</p>
                <Link to="/schedule-pickup">
                  <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full">
                    Schedule Your First Pickup
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="border border-slate-200 rounded-xl p-4 hover:border-sky-200 transition-colors"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-semibold text-slate-900">
                            {order.order_number}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              statusColors[order.status] || "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {statusLabels[order.status] || order.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {order.pickup_date || "TBD"}
                          </span>
                          {order.pickup_time_window && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {order.pickup_time_window}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm text-slate-500">
                          {order.service_type?.replace("_", " ")}
                        </p>
                        {order.total_amount != null && (
                          <p className="font-semibold text-slate-900">
                            ${Number(order.total_amount).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>

                    {order.pickup_address && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-start gap-2 text-sm text-slate-500">
                        <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>{order.pickup_address}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Profile Section */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-sky-600" />
                Address
              </h2>
              {customer?.address ? (
                <p className="text-slate-600">{customer.address}</p>
              ) : (
                <p className="text-slate-400 italic">No address saved</p>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                <Mail className="h-5 w-5 text-sky-600" />
                Profile
              </h2>
              <div className="space-y-2 text-sm">
                <p className="text-slate-600">
                  <span className="font-medium">Email:</span> {customer?.email}
                </p>
                {customer?.phone && (
                  <p className="text-slate-600">
                    <span className="font-medium">Phone:</span> {customer.phone}
                  </p>
                )}
              </div>
            </div>
          </div>

        </div>
      </section>

      <PublicFooter />
    </div>
  );
}