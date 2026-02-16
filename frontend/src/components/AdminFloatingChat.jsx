import { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import { MessageSquare, X } from "lucide-react";
import { toast } from "sonner";

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

  const loadOrders = async (status) => {
    setLoadingOrders(true);
    try {
      const res = await axios.get(`${API}/orders`, { params: { status } });
      setOrders(res.data || []);
    } catch (error) {
      toast.error("Error cargando órdenes");
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (open && activeTab === "orders") {
      loadOrders(orderStatusFilter);
    }
  }, [open, activeTab, orderStatusFilter]);

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setLoadingChat(true);
    try {
      const res = await axios.post(`${API}/admin/ai`, { message: prompt, execute: true });
      setReply(res.data.reply || "");
      setResults(res.data.results || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error con la IA");
    } finally {
      setLoadingChat(false);
    }
  };

  const sendLastCompletedMessage = async () => {
    setSendingLastCompleted(true);
    try {
      const res = await axios.post(`${API}/admin/orders/last-completed/notify`);
      toast.success(`Mensaje enviado: ${res.data.order_number || "última orden"}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "No se pudo enviar el mensaje");
    } finally {
      setSendingLastCompleted(false);
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await axios.patch(`${API}/orders/${orderId}/status`, null, { params: { status } });
      toast.success("Orden actualizada");
      loadOrders(orderStatusFilter);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error actualizando orden");
    }
  };

  const requestInsight = async (type) => {
    setLoadingInsight(true);
    try {
      const res = await axios.post(`${API}/admin/ai/insights`, { type });
      setInsight(res.data.reply || "");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error generando análisis");
    } finally {
      setLoadingInsight(false);
    }
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
            <div className="font-semibold text-slate-900">Asistente IA</div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Button variant={activeTab === "chat" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("chat")}>
              Chat
            </Button>
            <Button variant={activeTab === "orders" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("orders")}>
              Órdenes
            </Button>
            <Button variant={activeTab === "insights" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("insights")}>
              Análisis
            </Button>
          </div>

          {activeTab === "chat" && (
            <div className="p-4 space-y-4">
              <form onSubmit={handleChatSubmit} className="space-y-3">
                <Textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ej: Cambia la orden ORD-20240215-0001 a completed"
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={loadingChat}>
                    {loadingChat ? "Procesando..." : "Enviar"}
                  </Button>
                </div>
              </form>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={sendLastCompletedMessage} disabled={sendingLastCompleted}>
                  {sendingLastCompleted ? "Enviando..." : "Enviar mensaje a última orden completada"}
                </Button>
              </div>
              {reply && (
                <div className="text-sm text-slate-700 whitespace-pre-line">{reply}</div>
              )}
              {results.length > 0 && (
                <div className="space-y-1 text-xs text-slate-600">
                  {results.map((result, index) => (
                    <div key={index}>
                      {result.ok ? "✅" : "⚠️"} {result.type} {result.order_id || result.ticket_id || result.quote_id || result.lead_id || result.signup_id || result.customer_id || ""}
                      {result.status ? ` → ${result.status}` : ""}
                      {result.error ? ` (${result.error})` : ""}
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
                  className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={() => loadOrders(orderStatusFilter)}>
                  Recargar
                </Button>
              </div>

              {loadingOrders ? (
                <div className="text-sm text-slate-500">Cargando órdenes...</div>
              ) : orders.length === 0 ? (
                <div className="text-sm text-slate-500">Sin órdenes</div>
              ) : (
                <div className="space-y-3 max-h-[320px] overflow-y-auto">
                  {orders.map((order) => (
                    <div key={order.id} className="border border-slate-200 rounded-lg p-3">
                      <div className="text-sm font-medium text-slate-900">{order.order_number}</div>
                      <div className="text-xs text-slate-500">{order.customer_name || order.customer_id}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                          value={order.status}
                          onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>{status}</option>
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
                  Resumen
                </Button>
                <Button variant="outline" size="sm" onClick={() => requestInsight("risks")} disabled={loadingInsight}>
                  Riesgos
                </Button>
                <Button variant="outline" size="sm" onClick={() => requestInsight("forecast")} disabled={loadingInsight}>
                  Predicción
                </Button>
              </div>
              <div className="text-sm text-slate-700 whitespace-pre-line">
                {loadingInsight ? "Generando análisis..." : insight || "Selecciona una opción"}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
