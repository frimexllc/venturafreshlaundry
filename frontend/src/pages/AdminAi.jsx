import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { Bot, Send, Sparkles, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdminAi() {
  const [activeTab, setActiveTab] = useState("chat");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [results, setResults] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [proposalStatus, setProposalStatus] = useState("pendiente");
  const [proposals, setProposals] = useState([]);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [proposalActionNotes, setProposalActionNotes] = useState("");
  const [proposalActionMods, setProposalActionMods] = useState("");
  const [simulation, setSimulation] = useState(null);
  const [loadingSimulation, setLoadingSimulation] = useState(false);
  const [simulationStartDate, setSimulationStartDate] = useState("");
  const [simulationEndDate, setSimulationEndDate] = useState("");
  const [simulationService, setSimulationService] = useState("");
  const [simulationStatus, setSimulationStatus] = useState("");
  const [importOrigin, setImportOrigin] = useState("csv");
  const [importFile, setImportFile] = useState(null);
  const [importId, setImportId] = useState("");
  const [importHeaders, setImportHeaders] = useState([]);
  const [mappingText, setMappingText] = useState("");
  const [loadingImport, setLoadingImport] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [scanStatus, setScanStatus] = useState("idle");
  const [scanError, setScanError] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [manualPayload, setManualPayload] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    const userMessage = prompt.trim();
    setChatHistory(prev => [...prev, { role: "user", content: userMessage }]);
    setPrompt("");
    setLoading(true);
    
    try {
      // Use the new AI chat endpoint
      const res = await axios.post(`${API}/ai/chat`, { message: userMessage, execute: true });
      const aiReply = res.data.reply || "I couldn't process that request.";
      
      setChatHistory(prev => [...prev, { 
        role: "assistant", 
        content: aiReply,
        actions: res.data.actions || [],
        results: res.data.results || []
      }]);
      
      setReply(aiReply);
      setResults(res.data.results || []);
      
      // Show action results
      if (res.data.results && res.data.results.length > 0) {
        res.data.results.forEach(r => {
          if (r.ok) {
            toast.success(r.message || "Action completed");
          } else {
            toast.error(r.error || "Action failed");
          }
        });
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || "Error communicating with AI";
      toast.error(errorMsg);
      setChatHistory(prev => [...prev, { 
        role: "assistant", 
        content: `Error: ${errorMsg}`,
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setChatHistory([]);
    setReply("");
    setResults([]);
  };

  const quickPrompts = [
    "Show me today's orders summary",
    "What orders are ready for delivery?",
    "Show pending payments",
    "List open support tickets",
    "Show new leads this week",
    "What's the revenue for this month?"
  ];

  const loadProposals = async () => {
    setLoadingProposals(true);
    try {
      const params = proposalStatus === "all" ? {} : { estado: proposalStatus };
      const res = await axios.get(`${API}/ai/propuestas`, { params });
      setProposals(res.data || []);
      if (selectedProposal) {
        const updated = res.data.find((p) => p.id === selectedProposal.id);
        setSelectedProposal(updated || null);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error cargando propuestas");
    } finally {
      setLoadingProposals(false);
    }
  };

  const loadSimulation = async (proposalId) => {
    setLoadingSimulation(true);
    try {
      const params = {};
      if (simulationStartDate) params.start_date = simulationStartDate;
      if (simulationEndDate) params.end_date = simulationEndDate;
      if (simulationService) params.service_type = simulationService;
      if (simulationStatus) params.status = simulationStatus;
      const res = await axios.get(`${API}/ai/propuestas/${proposalId}/simulacion`, { params });
      setSimulation(res.data);
    } catch (error) {
      setSimulation(null);
    } finally {
      setLoadingSimulation(false);
    }
  };

  const runPatternScan = async () => {
    try {
      await axios.post(`${API}/ai/patrones/scan`, {});
      toast.success("Patrones analizados");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error analizando patrones");
    }
  };

  const generateProposals = async () => {
    try {
      await axios.post(`${API}/ai/propuestas/generar`, {});
      toast.success("Propuestas generadas");
      loadProposals();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error generando propuestas");
    }
  };

  const handleProposalAction = async (action) => {
    if (!selectedProposal) return;
    let modificaciones = null;
    if (proposalActionMods.trim()) {
      try {
        modificaciones = JSON.parse(proposalActionMods);
      } catch (error) {
        toast.error("JSON de modificaciones inválido");
        return;
      }
    }
    try {
      await axios.post(`${API}/ai/propuestas/${selectedProposal.id}/accion`, {
        accion: action,
        modificaciones,
        comentarios: proposalActionNotes || null
      });
      toast.success("Acción registrada");
      setProposalActionNotes("");
      setProposalActionMods("");
      loadProposals();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error aplicando acción");
    }
  };

  const handleImportUpload = async () => {
    if (!importFile) {
      toast.error("Selecciona un archivo");
      return;
    }
    setLoadingImport(true);
    try {
      const form = new FormData();
      form.append("file", importFile);
      const res = await axios.post(`${API}/admin/import?origen=${importOrigin}`, form, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setImportId(res.data.import_id);
      setImportHeaders(res.data.campos_detectados || []);
      setMappingText("");
      toast.success("Archivo cargado");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error subiendo archivo");
    } finally {
      setLoadingImport(false);
    }
  };

  const handleSuggestMapping = async () => {
    if (!importId) return;
    try {
      const res = await axios.post(`${API}/admin/import/${importId}/mapping/suggest`, {
        campos_legacy: importHeaders
      });
      const mapping = res.data.sugerencias || {};
      setMappingText(JSON.stringify(mapping, null, 2));
      toast.success("Mapeo sugerido");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error sugiriendo mapeo");
    }
  };

  const handleConfirmMapping = async () => {
    if (!importId) return;
    let mapping = {};
    try {
      mapping = mappingText ? JSON.parse(mappingText) : {};
    } catch (error) {
      toast.error("JSON de mapeo inválido");
      return;
    }
    try {
      const res = await axios.post(`${API}/admin/import/${importId}/mapping/confirm`, {
        mapping_campos: mapping
      });
      toast.success(`Órdenes creadas: ${res.data.ordenes_creadas || 0}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error confirmando mapeo");
    }
  };

  const handleRecoveryPlan = async () => {
    if (!importId) return;
    try {
      const res = await axios.post(`${API}/admin/import/${importId}/plan-recuperacion`);
      toast.success(`Propuesta creada: ${res.data.propuesta_id}`);
      loadProposals();
      setActiveTab("propuestas");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error generando plan");
    }
  };

  const stopScanner = async () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScannerActive(false);
    setTorchAvailable(false);
    setTorchEnabled(false);
  };

  const resolveQrPayload = async (payload) => {
    setScanStatus("resolving");
    setScanError("");
    try {
      const res = await axios.post(`${API}/orders/qr/resolve`, { payload });
      setScanResult(res.data);
      setScanStatus("success");
    } catch (error) {
      setScanResult(null);
      setScanStatus("error");
      setScanError(error.response?.data?.detail || "QR inválido o ilegible");
    }
  };

  const scanLoop = async () => {
    if (!videoRef.current || !canvasRef.current || !scannerActive) return;
    if (!("BarcodeDetector" in window)) {
      setScanStatus("error");
      setScanError("Escáner no soportado en este navegador");
      return;
    }
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const codes = await detector.detect(canvas);
      if (codes.length > 0) {
        const value = codes[0].rawValue;
        await stopScanner();
        await resolveQrPayload(value);
        return;
      }
    } catch (error) {
      setScanError("No se pudo leer el QR");
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  };

  const startScanner = async () => {
    setScanError("");
    setScanResult(null);
    setScanStatus("scanning");
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanStatus("error");
      setScanError("Cámara no disponible");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      setTorchAvailable(Boolean(capabilities.torch));
      setScannerActive(true);
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch (error) {
      setScanStatus("error");
      setScanError("No se pudo acceder a la cámara");
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track?.applyConstraints) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchEnabled }] });
      setTorchEnabled((prev) => !prev);
    } catch (error) {
      setScanError("La linterna no está disponible");
    }
  };

  const handleScanImage = async (file) => {
    if (!file) return;
    if (!("BarcodeDetector" in window)) {
      setScanStatus("error");
      setScanError("Escáner no soportado en este navegador");
      return;
    }
    setScanStatus("scanning");
    setScanError("");
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    const img = new Image();
    img.onload = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      try {
        const codes = await detector.detect(canvas);
        if (codes.length > 0) {
          await resolveQrPayload(codes[0].rawValue);
          return;
        }
        setScanStatus("error");
        setScanError("No se detectó QR en la imagen");
      } catch (error) {
        setScanStatus("error");
        setScanError("No se pudo leer la imagen");
      }
    };
    img.onerror = () => {
      setScanStatus("error");
      setScanError("Imagen inválida");
    };
    img.src = URL.createObjectURL(file);
  };

  useEffect(() => {
    if (activeTab === "propuestas") {
      loadProposals();
    }
  }, [activeTab, proposalStatus]);

  useEffect(() => {
    if (selectedProposal?.id) {
      loadSimulation(selectedProposal.id);
    } else {
      setSimulation(null);
    }
  }, [selectedProposal, simulationStartDate, simulationEndDate, simulationService, simulationStatus]);

  useEffect(() => {
    if (!selectedProposal) return;
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - 7);
    setSimulationEndDate(today.toISOString().slice(0, 10));
    setSimulationStartDate(past.toISOString().slice(0, 10));
    setSimulationService("");
    setSimulationStatus("");
  }, [selectedProposal?.id]);

  useEffect(() => {
    if (activeTab !== "scanner") {
      stopScanner();
    }
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Asistente IA</h1>
        <p className="text-slate-600">Solo para administrador. IA colaborativa, propuestas e importación.</p>
      </div>

      <div className="flex items-center gap-2">
        {["chat", "propuestas", "importacion", "scanner"].map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab(tab)}
          >
            {tab === "chat" ? "Chat" : tab === "propuestas" ? "Propuestas" : tab === "importacion" ? "Importación" : "Escáner"}
          </Button>
        ))}
      </div>

      {activeTab === "chat" && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-indigo-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    AI Business Assistant
                    <Sparkles className="h-4 w-4 text-amber-500" />
                  </h2>
                  <p className="text-xs text-slate-500">Groq • llama-3.3-70b</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearChat}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          </div>
          
          {/* Quick prompts */}
          <div className="p-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500 mb-2">Quick actions:</p>
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => setPrompt(qp)}
                  className="text-xs px-2 py-1 bg-white border border-slate-200 rounded-full hover:bg-sky-50 hover:border-sky-300 transition-colors"
                >
                  {qp}
                </button>
              ))}
            </div>
          </div>
          
          {/* Chat history */}
          <div className="h-[400px] overflow-y-auto p-4 space-y-4">
            {chatHistory.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Start a conversation with your AI assistant</p>
                <p className="text-sm mt-1">Ask about orders, customers, revenue, or request actions</p>
              </div>
            ) : (
              chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl p-3 ${
                    msg.role === 'user' 
                      ? 'bg-sky-600 text-white' 
                      : msg.isError 
                      ? 'bg-red-50 border border-red-200 text-red-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.results && msg.results.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-200">
                        {msg.results.map((r, ridx) => (
                          <div key={ridx} className="flex items-center gap-2 text-xs">
                            {r.ok ? (
                              <CheckCircle className="h-3 w-3 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-3 w-3 text-red-600" />
                            )}
                            <span>{r.message || r.error}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-600"></div>
                    <span className="text-sm text-slate-500">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          
          {/* Input */}
          <form onSubmit={handleSubmit} className="p-4 border-t border-slate-100 bg-slate-50">
            <div className="flex gap-2">
              <Textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask anything... (e.g., 'Show pending orders' or 'Mark order ORD-001 as ready')"
                className="flex-1 resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <Button type="submit" disabled={loading || !prompt.trim()} className="bg-sky-600 hover:bg-sky-700">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-2">Press Enter to send, Shift+Enter for new line</p>
          </form>
        </div>
      )}

      {activeTab === "propuestas" && (
        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                value={proposalStatus}
                onChange={(e) => setProposalStatus(e.target.value)}
              >
                <option value="pendiente">Pendientes</option>
                <option value="aceptada">Aceptadas</option>
                <option value="rechazada">Rechazadas</option>
                <option value="modificada">Modificadas</option>
                <option value="pospuesta">Pospuestas</option>
                <option value="all">Todas</option>
              </select>
              <Button variant="outline" size="sm" onClick={loadProposals} disabled={loadingProposals}>
                {loadingProposals ? "Cargando..." : "Recargar"}
              </Button>
              <Button variant="outline" size="sm" onClick={runPatternScan}>
                Analizar patrones
              </Button>
              <Button size="sm" onClick={generateProposals}>
                Generar propuestas
              </Button>
            </div>
            <div className="space-y-3">
              {proposals.length === 0 ? (
                <div className="text-sm text-slate-500">Sin propuestas</div>
              ) : (
                proposals.map((proposal) => (
                  <button
                    key={proposal.id}
                    className={`w-full text-left border rounded-lg p-3 ${selectedProposal?.id === proposal.id ? "border-sky-400 bg-sky-50" : "border-slate-200"}`}
                    onClick={() => setSelectedProposal(proposal)}
                  >
                    <div className="text-sm font-semibold text-slate-900">{proposal.tipo}</div>
                    <div className="text-xs text-slate-500">{proposal.estado}</div>
                    <div className="text-sm text-slate-700 mt-1 line-clamp-2">{proposal.descripcion}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            {!selectedProposal ? (
              <div className="text-sm text-slate-500">Selecciona una propuesta</div>
            ) : (
              <>
                <div>
                  <div className="text-lg font-semibold text-slate-900">{selectedProposal.tipo}</div>
                  <div className="text-xs text-slate-500">{selectedProposal.estado}</div>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-line">{selectedProposal.descripcion}</p>
                <div className="text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">Impacto</div>
                  <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto">{JSON.stringify(selectedProposal.impacto_estimado || {}, null, 2)}</pre>
                </div>
                <div className="text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">Acción sugerida</div>
                  <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto">{JSON.stringify(selectedProposal.accion_sugerida || {}, null, 2)}</pre>
                </div>
                <div className="text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">Simulación antes/después</div>
                  <div className="grid md:grid-cols-2 gap-3 text-xs mb-3">
                    <div>
                      <label className="text-slate-500">Inicio</label>
                      <Input type="date" value={simulationStartDate} onChange={(e) => setSimulationStartDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-slate-500">Fin</label>
                      <Input type="date" value={simulationEndDate} onChange={(e) => setSimulationEndDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-slate-500">Servicio</label>
                      <select
                        className="w-full h-9 rounded-md border border-slate-200 px-2 text-xs"
                        value={simulationService}
                        onChange={(e) => setSimulationService(e.target.value)}
                      >
                        <option value="">Todos</option>
                        <option value="pickup_delivery">Pickup & Delivery</option>
                        <option value="wash_fold">Wash & Fold</option>
                        <option value="self_service">Self Service</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-500">Estado</label>
                      <select
                        className="w-full h-9 rounded-md border border-slate-200 px-2 text-xs"
                        value={simulationStatus}
                        onChange={(e) => setSimulationStatus(e.target.value)}
                      >
                        <option value="">Todos</option>
                        <option value="new">Nueva</option>
                        <option value="processing">Procesando</option>
                        <option value="ready">Lista</option>
                        <option value="out_for_delivery">En camino</option>
                        <option value="completed">Completada</option>
                        <option value="cancelled">Cancelada</option>
                      </select>
                    </div>
                  </div>
                  {loadingSimulation ? (
                    <div className="text-xs text-slate-500">Calculando...</div>
                  ) : simulation ? (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="border border-slate-200 rounded-lg p-3">
                        <div className="text-slate-500 mb-2">Antes</div>
                        <div>Órdenes: {simulation.before?.ordenes ?? "-"}</div>
                        <div>Promedio procesamiento (h): {simulation.before?.avg_processing_horas ?? "-"}</div>
                        <div>Errores validación: {simulation.before?.errores_validacion ?? "-"}</div>
                      </div>
                      <div className="border border-slate-200 rounded-lg p-3">
                        <div className="text-slate-500 mb-2">Después</div>
                        <div>Órdenes: {simulation.after?.ordenes ?? "-"}</div>
                        <div>Promedio procesamiento (h): {simulation.after?.avg_processing_horas ?? "-"}</div>
                        <div>Errores validación: {simulation.after?.errores_validacion ?? "-"}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">Sin simulación disponible</div>
                  )}
                </div>
                {simulation && (
                  <div className="text-xs text-slate-600 space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border border-slate-200 rounded-lg p-3">
                        <div className="text-slate-500 mb-2">Impacto real</div>
                        <div>Errores antes: {simulation.impacto_real?.errores_before ?? "-"}</div>
                        <div>Errores después: {simulation.impacto_real?.errores_after ?? "-"}</div>
                        <div>Órdenes antes: {simulation.impacto_real?.ordenes_before ?? "-"}</div>
                        <div>Órdenes después: {simulation.impacto_real?.ordenes_after ?? "-"}</div>
                      </div>
                      <div className="border border-slate-200 rounded-lg p-3">
                        <div className="text-slate-500 mb-2">Distribución</div>
                        <div>Servicios: {simulation.por_servicio?.map((s) => `${s._id}:${s.count}`).join(" | ") || "-"}</div>
                        <div>Estados: {simulation.por_estado?.map((s) => `${s._id}:${s.count}`).join(" | ") || "-"}</div>
                      </div>
                    </div>
                  </div>
                )}
                <Textarea
                  rows={3}
                  placeholder="Comentarios"
                  value={proposalActionNotes}
                  onChange={(e) => setProposalActionNotes(e.target.value)}
                />
                <Textarea
                  rows={4}
                  placeholder='Modificaciones (JSON) opcional'
                  value={proposalActionMods}
                  onChange={(e) => setProposalActionMods(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => handleProposalAction("aceptar")}>Aceptar</Button>
                  <Button size="sm" variant="outline" onClick={() => handleProposalAction("modificar")}>Modificar</Button>
                  <Button size="sm" variant="outline" onClick={() => handleProposalAction("posponer")}>Posponer</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleProposalAction("rechazar")}>Rechazar</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === "importacion" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="grid md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            <div>
              <label className="text-sm text-slate-600">Archivo</label>
              <Input type="file" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
            </div>
            <div>
              <label className="text-sm text-slate-600">Origen</label>
              <select
                className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm"
                value={importOrigin}
                onChange={(e) => setImportOrigin(e.target.value)}
              >
                <option value="csv">CSV</option>
                <option value="excel">Excel</option>
                <option value="jira">Jira</option>
              </select>
            </div>
            <Button onClick={handleImportUpload} disabled={loadingImport}>
              {loadingImport ? "Subiendo..." : "Subir"}
            </Button>
          </div>
          {importId && (
            <div className="space-y-3">
              <div className="text-sm text-slate-600">Import ID: {importId}</div>
              <div className="text-sm text-slate-700">Campos detectados: {importHeaders.join(", ")}</div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleSuggestMapping}>Sugerir mapeo</Button>
                <Button size="sm" onClick={handleConfirmMapping}>Confirmar mapeo</Button>
                <Button variant="outline" size="sm" onClick={handleRecoveryPlan}>Generar plan recuperación</Button>
              </div>
              <Textarea
                rows={6}
                placeholder="Mapeo en JSON"
                value={mappingText}
                onChange={(e) => setMappingText(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === "scanner" && (
        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={startScanner} disabled={scannerActive}>Iniciar escaneo</Button>
              <Button variant="outline" onClick={stopScanner} disabled={!scannerActive}>Detener</Button>
              <Button variant="outline" onClick={toggleTorch} disabled={!torchAvailable}>
                {torchEnabled ? "Apagar linterna" : "Encender linterna"}
              </Button>
            </div>
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
              <video ref={videoRef} className="w-full h-64 object-cover" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="text-sm text-slate-600">
              {scanStatus === "scanning" && "Escaneando..."}
              {scanStatus === "resolving" && "Procesando QR..."}
              {scanStatus === "success" && "QR leído correctamente"}
              {scanStatus === "error" && scanError}
            </div>
            <div className="grid md:grid-cols-[1fr_auto] gap-3">
              <Input
                placeholder="Pega el QR token o payload JSON"
                value={manualPayload}
                onChange={(e) => setManualPayload(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => resolveQrPayload(manualPayload)}
                disabled={!manualPayload.trim()}
              >
                Procesar manual
              </Button>
            </div>
            <div>
              <label className="text-sm text-slate-600">Escanear desde imagen</label>
              <Input type="file" accept="image/*" onChange={(e) => handleScanImage(e.target.files?.[0])} />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            {!scanResult ? (
              <div className="text-sm text-slate-500">Sin datos de orden</div>
            ) : (
              <>
                <div>
                  <div className="text-lg font-semibold text-slate-900">Orden {scanResult.order_number}</div>
                  <div className="text-xs text-slate-500">{scanResult.order_id}</div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-slate-500">Servicio</div>
                    <div className="font-medium">{scanResult.service_type || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Estado</div>
                    <div className="font-medium">{scanResult.status || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Cliente</div>
                    <div className="font-medium">{scanResult.customer_name || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Monto</div>
                    <div className="font-medium">{scanResult.total_amount ? `$${scanResult.total_amount}` : "-"}</div>
                  </div>
                </div>
                <div className="text-sm">
                  <div className="text-slate-500">Dirección</div>
                  <div className="font-medium">{scanResult.address?.full || "-"}</div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-slate-500">Fecha solicitud</div>
                    <div className="font-medium">{scanResult.request_datetime || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Hora pickup</div>
                    <div className="font-medium">{scanResult.pickup_time_window || "-"}</div>
                  </div>
                </div>
                <div className="text-sm">
                  <div className="text-slate-500">Instrucciones</div>
                  <div className="font-medium">{scanResult.special_instructions || "-"}</div>
                </div>
                <div className="text-sm">
                  <div className="text-slate-500">Servicios incluidos</div>
                  {Array.isArray(scanResult.items) && scanResult.items.length > 0 ? (
                    <ul className="list-disc list-inside">
                      {scanResult.items.map((item, index) => (
                        <li key={index}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="font-medium">-</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
