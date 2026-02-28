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
import { useLocale } from "../context/LocaleContext";

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

export default function CustomerAccount() {
  const { t, locale } = useLocale();
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

  // Status labels with translation
  const statusLabels = {
    new: t("New", "Nueva"),
    processing: t("Processing", "Procesando"),
    ready: t("Ready", "Lista"),
    out_for_delivery: t("Out for Delivery", "En camino"),
    delivered: t("Delivered", "Entregada"),
    completed: t("Completed", "Completada"),
    cancelled: t("Cancelled", "Cancelada"),
  };

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

  const fetchPreferences = async (token) => {
    setPreferencesLoading(true);
    try {
      const res = await axios.get(`${API}/customer/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data || {};
      setPreferences({
        detergent_type: data.detergent_type || "",
        water_temperature: data.water_temperature || "",
        fabric_softener: data.fabric_softener || "",
        folding_style: data.folding_style || "",
        hanging_instructions: data.hanging_instructions || "",
        allergies: data.allergies || "",
        special_instructions: data.special_instructions || "",
        pickup_time_preference: data.pickup_time_preference || "",
        gate_code: data.gate_code || ""
      });
      setPreferencesMeta({ updated_at: data.updated_at || null, version: data.version || null });
    } catch (error) {
      if (error.response?.status !== 404) {
        toast.error(t("Could not load preferences", "No se pudieron cargar las preferencias"));
      }
    } finally {
      setPreferencesLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("customer_token");
    localStorage.removeItem("customer_data");
    toast.success(t("Signed out successfully", "Sesión cerrada correctamente"));
    navigate("/account/login");
  };

  const handleSavePreferences = async () => {
    const token = localStorage.getItem("customer_token");
    if (!token) return;
    try {
      const res = await axios.post(`${API}/customer/preferences`, preferences, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(t("Preferences saved", "Preferencias guardadas"));
      setPreferencesMeta({ updated_at: res.data.updated_at || null, version: res.data.version || null });
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Could not save preferences", "No se pudieron guardar las preferencias"));
    }
  };

  const handleDeletePreferences = async () => {
    const token = localStorage.getItem("customer_token");
    if (!token) return;
    try {
      await axios.delete(`${API}/customer/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(t("Preferences deleted", "Preferencias eliminadas"));
      setPreferences({
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
      setPreferencesMeta({ updated_at: null, version: null });
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Could not delete preferences", "No se pudieron eliminar las preferencias"));
    }
  };

  // Helper to format date based on locale
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === "es" ? "es-ES" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
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
                    {t("Hi, {name}", "Hola, {name}").replace("{name}", customer?.name?.split(" ")[0] || t("Customer", "Cliente"))}
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
                {t("Sign out", "Cerrar sesión")}
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100 mb-6" data-testid="customer-preferences-card">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{t("Laundry preferences", "Preferencias de lavandería")}</h2>
                <p className="text-slate-500 text-sm">
                  {t("These preferences will be automatically applied to your next orders.", "Estas preferencias se aplicarán automáticamente a tus próximas órdenes.")}
                </p>
              </div>
              {preferencesMeta.updated_at && (
                <span className="text-xs text-slate-500" data-testid="customer-preferences-updated">
                  {t("Updated", "Actualizado")}: {formatDate(preferencesMeta.updated_at)}
                </span>
              )}
            </div>

            {preferencesLoading ? (
              <div className="flex items-center justify-center py-6" data-testid="customer-preferences-loading">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600"></div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>{t("Preferred detergent", "Detergente preferido")}</Label>
                    <Select value={preferences.detergent_type} onValueChange={(value) => setPreferences({ ...preferences, detergent_type: value })}>
                      <SelectTrigger className="mt-1" data-testid="customer-pref-detergent">
                        <SelectValue placeholder={t("Select detergent", "Selecciona detergente")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hypoallergenic">{t("Hypoallergenic", "Hipoalergénico")}</SelectItem>
                        <SelectItem value="free_clear">{t("Free & Clear", "Sin fragancia")}</SelectItem>
                        <SelectItem value="lavender">{t("Lavender", "Lavanda")}</SelectItem>
                        <SelectItem value="standard">{t("Standard", "Estándar")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("Water temperature", "Temperatura de lavado")}</Label>
                    <Select value={preferences.water_temperature} onValueChange={(value) => setPreferences({ ...preferences, water_temperature: value })}>
                      <SelectTrigger className="mt-1" data-testid="customer-pref-temperature">
                        <SelectValue placeholder={t("Select temperature", "Selecciona temperatura")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cold">{t("Cold", "Fría")}</SelectItem>
                        <SelectItem value="warm">{t("Warm", "Tibia")}</SelectItem>
                        <SelectItem value="hot">{t("Hot", "Caliente")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("Fabric softener", "Suavizante")}</Label>
                    <Select value={preferences.fabric_softener} onValueChange={(value) => setPreferences({ ...preferences, fabric_softener: value })}>
                      <SelectTrigger className="mt-1" data-testid="customer-pref-softener">
                        <SelectValue placeholder={t("Select softener", "Selecciona suavizante")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("None", "Sin suavizante")}</SelectItem>
                        <SelectItem value="light">{t("Light", "Ligero")}</SelectItem>
                        <SelectItem value="standard">{t("Standard", "Estándar")}</SelectItem>
                        <SelectItem value="extra">{t("Extra", "Extra")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("Folding style", "Estilo de doblado")}</Label>
                    <Select value={preferences.folding_style} onValueChange={(value) => setPreferences({ ...preferences, folding_style: value })}>
                      <SelectTrigger className="mt-1" data-testid="customer-pref-folding">
                        <SelectValue placeholder={t("Select style", "Selecciona estilo")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">{t("Standard", "Estándar")}</SelectItem>
                        <SelectItem value="konmari">{t("KonMari", "KonMari")}</SelectItem>
                        <SelectItem value="stacked">{t("Premium stacked", "Apilado premium")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>{t("Hanging / special items", "Colgado / prendas especiales")}</Label>
                  <Input
                    value={preferences.hanging_instructions}
                    onChange={(e) => setPreferences({ ...preferences, hanging_instructions: e.target.value })}
                    className="mt-1"
                    placeholder={t("e.g. Shirts on hangers", "Ej. Camisas en gancho")}
                    data-testid="customer-pref-hanging"
                  />
                </div>

                <div>
                  <Label>{t("Allergies or sensitivities", "Alergias o sensibilidades")}</Label>
                  <Textarea
                    value={preferences.allergies}
                    onChange={(e) => setPreferences({ ...preferences, allergies: e.target.value })}
                    className="mt-1"
                    placeholder={t("e.g. No fragrances", "Ej. Sin fragancias")}
                    data-testid="customer-pref-allergies"
                  />
                </div>

                <div>
                  <Label>{t("Additional notes", "Notas adicionales")}</Label>
                  <Textarea
                    value={preferences.special_instructions}
                    onChange={(e) => setPreferences({ ...preferences, special_instructions: e.target.value })}
                    className="mt-1"
                    placeholder={t("Special instructions", "Instrucciones especiales")}
                    data-testid="customer-pref-notes"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>{t("Preferred pickup time", "Horario preferido de pickup")}</Label>
                    <Input
                      value={preferences.pickup_time_preference}
                      onChange={(e) => setPreferences({ ...preferences, pickup_time_preference: e.target.value })}
                      className="mt-1"
                      placeholder={t("e.g. 8am - 12pm", "Ej. 8am - 12pm")}
                      data-testid="customer-pref-pickup-time"
                    />
                  </div>
                  <div>
                    <Label>{t("Gate / Access code", "Puerta / Código de acceso")}</Label>
                    <Input
                      value={preferences.gate_code}
                      onChange={(e) => setPreferences({ ...preferences, gate_code: e.target.value })}
                      className="mt-1"
                      placeholder={t("e.g. 1234#", "Ej. 1234#")}
                      data-testid="customer-pref-gate"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button onClick={handleSavePreferences} className="bg-sky-600 hover:bg-sky-700" data-testid="customer-preferences-save">
                    {t("Save preferences", "Guardar preferencias")}
                  </Button>
                  <Button variant="outline" onClick={handleDeletePreferences} data-testid="customer-preferences-delete">
                    {t("Delete preferences", "Eliminar preferencias")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Orders Section */}
          <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-100 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Package className="h-5 w-5 text-sky-600" />
                {t("Orders", "Órdenes")}
              </h2>
              <Link to="/schedule-pickup">
                <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full text-sm">
                  {t("New Pickup", "Nueva recogida")}
                </Button>
              </Link>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Package className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-slate-600 mb-4">{t("No orders yet", "Aún no tienes órdenes")}</p>
                <Link to="/schedule-pickup">
                  <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full">
                    {t("Schedule Your First Pickup", "Programa tu primera recogida")}
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
                {t("Address", "Dirección")}
              </h2>
              {customer?.address ? (
                <p className="text-slate-600">{customer.address}</p>
              ) : (
                <p className="text-slate-400 italic">{t("No address saved", "No hay dirección guardada")}</p>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                <Mail className="h-5 w-5 text-sky-600" />
                {t("Profile", "Perfil")}
              </h2>
              <div className="space-y-2 text-sm">
                <p className="text-slate-600">
                  <span className="font-medium">{t("Email", "Correo")}:</span> {customer?.email}
                </p>
                {customer?.phone && (
                  <p className="text-slate-600">
                    <span className="font-medium">{t("Phone", "Teléfono")}:</span> {customer.phone}
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