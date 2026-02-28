import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import { MessageSquare, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusOptions = [
  "new",
  "processing",
  "ready",
  "out_for_delivery",
  "delivered",
  "completed",
  "cancelled"
];

export default function AdminFloatingChat() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [results, setResults] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState("new");
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [insight, setInsight] = useState("");
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sendingLastCompleted, setSendingLastCompleted] = useState(false);

  const loadOrders = useCallback(async (status) => {
    setLoadingOrders(true);
    try {
      const res = await axios.get(`${API}/orders`, { params: { status } });
      setOrders(res.data || []);
    } catch (error) {
      toast.error(t("Error loading orders", "Error cargando órdenes"));
    } finally {
      setLoadingOrders(false);
    }
  }, [t]);

  useEffect(() => {
    if (open && activeTab === "orders") {
      loadOrders(orderStatusFilter);
    }
  }, [open, activeTab, orderStatusFilter, loadOrders]);

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoadingChat(true);
    try {
      const res = await axios.post(`${API}/admin/ai`, { message: prompt, execute: true });
      setReply(res.data.reply || "");
      setResults(res.data.results || []);
      if (res.data.results?.length > 0) {
        const successCount = res.data.results.filter(r => r.ok).length;
        const errorCount = res.data.results.filter(r => !r.ok).length;
        if (errorCount === 0) {
          toast.success(t("All actions completed successfully", "Todas las acciones se completaron correctamente"));
        } else {
          toast.warning(t("{success} completed, {error} failed", "{success} completadas, {error} fallidas")
            .replace("{success}", successCount).replace("{error}", errorCount));
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error with AI", "Error con la IA"));
    } finally {
      setLoadingChat(false);
    }
  };

  const sendLastCompletedMessage = async () => {
    setSendingLastCompleted(true);
    try {
      const res = await axios.post(`${API}/admin/orders/last-completed/notify`);
      toast.success(t("Message sent: {order}", "Mensaje enviado: {order}")
        .replace("{order}", res.data.order_number || t("last order", "última orden")));
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Could not send message", "No se pudo enviar el mensaje"));
    } finally {
      setSendingLastCompleted(false);
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await axios.patch(`${API}/orders/${orderId}/status`, null, { params: { status } });
      toast.success(t("Order updated", "Orden actualizada"));
      loadOrders(orderStatusFilter);
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error updating order", "Error actualizando orden"));
    }
  };

  const requestInsight = async (type) => {
    setLoadingInsight(true);
    try {
      const res = await axios.post(`${API}/admin/ai/insights`, { type });
      setInsight(res.data.reply || "");
    } catch (error) {
      toast.error(error.response?.data?.detail || t("Error generating insight", "Error generando análisis"));
    } finally {
      setLoadingInsight(false);
    }
  };

  const clearChat = () => {
    setPrompt("");
    setReply("");
    setResults([]);
  };

  // Traducción de opciones de estado
  const getStatusLabel = (status) => {
    const map = {
      new: t("New", "Nueva"),
      processing: t("Processing", "Procesando"),
      ready: t("Ready", "Lista"),
      out_for_delivery: t("Out for delivery", "En camino"),
      delivered: t("Delivered", "Entregada"),
      completed: t("Completed", "Completada"),
      cancelled: t("Cancelled", "Cancelada")
    };
    return map[status] || status;
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[60]">
        <Button
          onClick={() => setOpen(true)}
          className="rounded-full h-14 w-14 p-0 shadow-lg bg-sky-600 hover:bg-sky-700 text-white"
        >
          <MessageSquare className="h-6 w-6" />
        </Button>
      </div>

      {open && (
        <div className="fixed bottom-6 right-6 z-[70] w-[360px] sm:w-[420px] bg-white border border-slate-200 rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <div className="font-semibold text-slate-900">{t("AI Assistant", "Asistente IA")}</div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Button 
              variant={activeTab === "chat" ? "default" : "outline"} 
              size="sm" 
              onClick={() => setActiveTab("chat")}
            >
              {t("Chat", "Chat")}
            </Button>
            <Button 
              variant={activeTab === "orders" ? "default" : "outline"} 
              size="sm" 
              onClick={() => setActiveTab("orders")}
            >
              {t("Orders", "Órdenes")}
            </Button>
            <Button 
              variant={activeTab === "insights" ? "default" : "outline"} 
              size="sm" 
              onClick={() => setActiveTab("insights")}
            >
              {t("Analysis", "Análisis")}
            </Button>
          </div>

          {activeTab === "chat" && (
            <div className="p-4 space-y-4">
              <form onSubmit={handleChatSubmit} className="space-y-3">
                <Textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t(
                    "Example: Change order ORD-20240215-0001 to completed",
                    "Ej: Cambia la orden ORD-20240215-0001 a completed"
                  )}
                />
                <div className="flex justify-end gap-2">
                  {reply && (
                    <Button type="button" variant="outline" size="sm" onClick={clearChat}>
                      {t("Clear", "Limpiar")}
                    </Button>
                  )}
                  <Button type="submit" disabled={loadingChat}>
                    {loadingChat ? t("Processing...", "Procesando...") : t("Send", "Enviar")}
                  </Button>
                </div>
              </form>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={sendLastCompletedMessage} disabled={sendingLastCompleted}>
                  {sendingLastCompleted ? t("Sending...", "Enviando...") : t("Send message to last completed order", "Enviar mensaje a última orden completada")}
                </Button>
              </div>
              {reply && (
                <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700 whitespace-pre-line">
                  {reply}
                </div>
              )}
              {results.length > 0 && (
                <div className="space-y-1 text-xs text-slate-600">
                  {results.map((result, index) => (
                    <div key={index} className="flex items-start gap-1">
                      <span>{result.ok ? "✅" : "⚠️"}</span>
                      <span>
                        {result.type} {result.order_id || result.ticket_id || result.quote_id || result.lead_id || result.signup_id || result.customer_id || ""}
                        {result.status ? ` → ${getStatusLabel(result.status)}` : ""}
                        {result.error ? ` (${result.error})` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "orders" && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <select
                  className="h-9 rounded-md border border-slate-200 px-2 text-sm flex-1"
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{getStatusLabel(status)}</option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={() => loadOrders(orderStatusFilter)} disabled={loadingOrders}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${loadingOrders ? 'animate-spin' : ''}`} />
                  {t("Reload", "Recargar")}
                </Button>
              </div>

              {loadingOrders ? (
                <div className="text-sm text-slate-500 text-center py-4">
                  {t("Loading orders...", "Cargando órdenes...")}
                </div>
              ) : orders.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-4">
                  {t("No orders", "Sin órdenes")}
                </div>
              ) : (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {orders.map((order) => (
                    <div key={order.id} className="border border-slate-200 rounded-lg p-3">
                      <div className="text-sm font-medium text-slate-900">{order.order_number}</div>
                      <div className="text-xs text-slate-500">{order.customer_name || order.customer_id}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          className="h-9 rounded-md border border-slate-200 px-2 text-sm flex-1"
                          value={order.status}
                          onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>{getStatusLabel(status)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "insights" && (
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => requestInsight("summary")} disabled={loadingInsight}>
                  {t("Summary", "Resumen")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => requestInsight("risks")} disabled={loadingInsight}>
                  {t("Risks", "Riesgos")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => requestInsight("forecast")} disabled={loadingInsight}>
                  {t("Forecast", "Predicción")}
                </Button>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700 whitespace-pre-line min-h-[80px]">
                {loadingInsight ? t("Generating analysis...", "Generando análisis...") : insight || t("Select an option", "Selecciona una opción")}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}