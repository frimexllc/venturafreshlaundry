import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, ChevronDown, Zap, BrainCircuit, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { SEVERITY_LABELS } from '../../utils/traffic';
import { ORDER_STATUS_LABELS } from '../../utils/orders';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const PROACTIVE_INTERVAL_MS = 10 * 60 * 1000;
const AUTO_OPEN_DELAY_MS = 2800;

const WAKE_PHRASES = ['hey tim', 'oye tim', 'ei tim', 'ey tim', 'hei tim', 'hey team', 'oye team', 'tim despierta', 'tim activa'];
function isWakeWord(transcript) { const t = transcript.toLowerCase().replace(/[!?.,]/g, '').trim(); return WAKE_PHRASES.some((p) => t.includes(p)); }
function cleanForSpeech(text) { return text.replace(/[*_`#~>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 350); }

function buildSystemPrompt(routeResult, trafficEvents, nearbyOpportunities, totalDelay) {
  const pickups = routeResult?.stops.filter((s) => s.order.status === 'pending').length ?? 0;
  const deliveries = routeResult?.stops.filter((s) => s.order.status === 'ready').length ?? 0;
  const routeInfo = routeResult ? `Ruta activa: ${routeResult.stops.length} paradas (${pickups} recogidas + ${deliveries} entregas). Distancia: ${routeResult.totalDistance} mi. ETA: ${Math.floor(routeResult.estimatedDuration / 60)}h ${routeResult.estimatedDuration % 60}m. Combustible: $${routeResult.estimatedFuelCost}.` : 'Sin ruta activa.';
  const trafficInfo = trafficEvents.length > 0 ? `Trafico activo (+${totalDelay} min): ${trafficEvents.map((e) => `${e.road} — ${SEVERITY_LABELS[e.severity]} (+${e.delayMinutes}min)`).join('; ')}.` : 'Sin alertas de trafico.';
  const oppInfo = nearbyOpportunities.length > 0 ? `${nearbyOpportunities.length} cliente(s) Wash & Fold cerca de la ruta.` : 'Sin oportunidades cercanas.';
  return `Eres TIM — Transportation Intelligence Module v3.7. Copiloto de despacho IA para Ventura Fresh Laundry. Estilo JARVIS de Iron Man: conciso, tecnico, con humor seco.\n\nCONTEXTO:\n- ${routeInfo}\n- ${trafficInfo}\n- ${oppInfo}\n\nCOMANDOS DE VOZ:\n- "marca parada N como completada"\n- "cambia la orden VF-001 a [estado]"\n- "avanza la orden VF-001"\n- Estados: pendiente, recolectado, en proceso, listo, en camino, entregado\n\nREGLAS:\n- Responde SIEMPRE en espanol mexicano.\n- Maximo 3 oraciones. DIRECTO AL GRANO.\n- Llama al usuario "jefe" con moderacion.\n- No inventes datos.`;
}

async function callTimBackend(messages) {
  const res = await fetch(`${API_URL}/api/tim/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })), max_tokens: 220, temperature: 0.75 }),
  });
  if (!res.ok) throw new Error(`TIM ${res.status}`);
  const data = await res.json();
  return data.content || '';
}

let ttsUtterance = null;
function speak(text, onEnd) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleanForSpeech(text));
  utterance.lang = 'es-MX'; utterance.rate = 1.08; utterance.pitch = 0.88;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((v) => v.lang.startsWith('es') && (v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('jorge'))) ?? voices.find((v) => v.lang.startsWith('es')) ?? null;
  if (preferred) utterance.voice = preferred;
  if (onEnd) utterance.onend = onEnd;
  ttsUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}
function stopSpeaking() { window.speechSynthesis?.cancel(); ttsUtterance = null; }

const TIM_MEMORY_KEY = 'vfl-tim-memory';
const MAX_MEMORY_MSGS = 30;

const STATUS_ALIASES = { pendiente: 'pending', recolectado: 'picked-up', recogido: 'picked-up', 'en proceso': 'in-process', procesando: 'in-process', listo: 'ready', lista: 'ready', 'en camino': 'shipping', 'en ruta': 'shipping', entregado: 'delivered', completado: 'delivered' };

function parseStatusChangeCommand(text, orders) {
  const t = text.toLowerCase().replace(/[!?]/g, '').trim();
  const orderNumMatch = t.match(/(?:orden|pedido)?\s*(vf[l]?-?\d+|\d{3,})/i);
  let targetOrder;
  if (orderNumMatch) {
    const ref = orderNumMatch[1].toUpperCase().replace(/^VF-?/, 'VFL-');
    targetOrder = orders.find((o) => o.orderNumber?.toUpperCase() === ref || o.orderNumber?.replace('VFL-', '') === orderNumMatch[1]);
  }
  let targetStatus;
  for (const [alias, status] of Object.entries(STATUS_ALIASES)) { if (t.includes(alias)) { targetStatus = status; break; } }
  if (!targetStatus && t.match(/avanza|adelanta|siguiente/)) {
    if (targetOrder) {
      const flow = ['pending', 'picked-up', 'in-process', 'ready', 'shipping', 'delivered'];
      const idx = flow.indexOf(targetOrder.status);
      if (idx < flow.length - 1) targetStatus = flow[idx + 1];
    }
  }
  if (!targetOrder || !targetStatus || targetOrder.status === targetStatus) return null;
  return { order: targetOrder, newStatus: targetStatus };
}

function parseCompleteStopCommand(text) {
  const t = text.toLowerCase().replace(/[!?.,]/g, '');
  const patterns = [/(?:marca|completa|confirma)\s+(?:parada|stop)\s+(?:n[uú]mero\s+)?(\d+)/, /(?:parada|stop)\s+(\d+)\s+(?:completada|lista|hecha)/, /(?:complet\w*)\s+(?:la\s+)?(?:parada|stop)\s+(\d+)/];
  for (const re of patterns) { const m = t.match(re); if (m) return Math.max(0, parseInt(m[1], 10) - 1); }
  return null;
}

export function TimAssistant({ routeResult, trafficEvents, nearbyOpportunities, totalTrafficDelay, timRef, onCompleteStop, onUpdateOrderStatus, orders = [] }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try { const raw = localStorage.getItem(TIM_MEMORY_KEY); if (!raw) return []; const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.slice(-MAX_MEMORY_MSGS) : []; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [bgWorking, setBgWorking] = useState(false);
  const [voiceState, setVoiceState] = useState('off');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [voiceSupported] = useState(() => typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window));

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const autoOpenedRef = useRef(false);
  const proactiveTimerRef = useRef(null);
  const voiceStateRef = useRef('off');
  const wakeRecRef = useRef(null);
  const cmdRecRef = useRef(null);
  const prevTrafficRef = useRef('');

  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);
  useEffect(() => { try { localStorage.setItem(TIM_MEMORY_KEY, JSON.stringify(messages.filter(m => m.role !== 'system').slice(-MAX_MEMORY_MSGS))); } catch {} }, [messages]);

  const getSystemPrompt = useCallback(() => buildSystemPrompt(routeResult, trafficEvents, nearbyOpportunities, totalTrafficDelay), [routeResult, trafficEvents, nearbyOpportunities, totalTrafficDelay]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (open) { setUnread(0); inputRef.current?.focus(); } }, [open]);
  useEffect(() => { if (open && messages.length === 0) triggerGreeting(); }, [open]); // eslint-disable-line
  useEffect(() => {
    if (autoOpenedRef.current) return;
    const t = setTimeout(() => { if (!autoOpenedRef.current) { autoOpenedRef.current = true; setOpen(true); } }, AUTO_OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Proactive traffic watch
  useEffect(() => {
    const sig = trafficEvents.map((e) => `${e.id}:${e.severity}`).join(',');
    if (sig === prevTrafficRef.current || sig === '') { prevTrafficRef.current = sig; return; }
    const prev = prevTrafficRef.current;
    prevTrafficRef.current = sig;
    if (prev === '') return;
    const newHeavy = trafficEvents.filter((e) => e.severity === 'heavy' && !prev.includes(`${e.id}:heavy`));
    if (!newHeavy.length) return;
    const roads = newHeavy.map((e) => e.road).join(', ');
    sendProactiveMessage(`ALERTA — Trafico pesado en: ${roads}. Genera alerta breve.`);
  }, [trafficEvents]); // eslint-disable-line

  useEffect(() => {
    proactiveTimerRef.current = setInterval(() => { sendProactiveMessage('Check-in breve sobre el estado de la ruta.'); }, PROACTIVE_INTERVAL_MS);
    return () => { if (proactiveTimerRef.current) clearInterval(proactiveTimerRef.current); };
  }, []); // eslint-disable-line

  useEffect(() => {
    if (timRef) timRef.current = { sendProactive: sendProactiveMessage, onCompleteStop, updateOrderStatus: onUpdateOrderStatus };
  }, [timRef, onCompleteStop, onUpdateOrderStatus]); // eslint-disable-line

  // Voice functions
  function startWakeListening() {
    if (!voiceSupported) return;
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = 'es-MX'; rec.maxAlternatives = 3;
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        for (let j = 0; j < event.results[i].length; j++) {
          if (isWakeWord(event.results[i][j].transcript)) { rec.stop(); wakeRecRef.current = null; activateByVoice(); return; }
        }
      }
    };
    rec.onerror = (e) => { if (e.error === 'not-allowed') setVoiceState('off'); };
    rec.onend = () => { if (voiceStateRef.current === 'wake') setTimeout(() => { if (voiceStateRef.current === 'wake') startWakeListening(); }, 200); };
    rec.start();
    wakeRecRef.current = rec;
  }

  function activateByVoice() {
    setVoiceState('command'); setTranscript(''); setOpen(true);
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false; rec.interimResults = true; rec.lang = 'es-MX';
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    let finalTranscript = '';
    rec.onresult = (event) => { let interim = ''; for (let i = event.resultIndex; i < event.results.length; i++) { if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript; else interim += event.results[i][0].transcript; } setTranscript(finalTranscript || interim); };
    rec.onend = () => { cmdRecRef.current = null; const cmd = finalTranscript.trim(); if (cmd.length > 1) handleVoiceCommand(cmd); else { setTranscript(''); setVoiceState('wake'); startWakeListening(); } };
    rec.onerror = () => { setTranscript(''); setVoiceState('wake'); startWakeListening(); };
    rec.start(); cmdRecRef.current = rec;
  }

  async function handleVoiceCommand(cmd) {
    setVoiceState('processing'); setTranscript('');
    setMessages((prev) => [...prev, { role: 'user', content: cmd, timestamp: Date.now() }]);
    const stopIdx = parseCompleteStopCommand(cmd);
    if (stopIdx !== null && onCompleteStop) {
      onCompleteStop(stopIdx);
      const confirmMsg = `Entendido. Parada ${stopIdx + 1} marcada como completada.`;
      setMessages((prev) => [...prev, { role: 'assistant', content: confirmMsg, timestamp: Date.now() }]);
      if (ttsEnabled) { setVoiceState('speaking'); speak(confirmMsg, () => { setVoiceState('wake'); startWakeListening(); }); } else { setVoiceState('wake'); startWakeListening(); }
      return;
    }
    const statusCmd = parseStatusChangeCommand(cmd, orders);
    if (statusCmd && onUpdateOrderStatus) {
      onUpdateOrderStatus(statusCmd.order.id, statusCmd.newStatus);
      const confirmMsg = `Orden ${statusCmd.order.orderNumber} actualizada a "${ORDER_STATUS_LABELS[statusCmd.newStatus] ?? statusCmd.newStatus}".`;
      setMessages((prev) => [...prev, { role: 'assistant', content: confirmMsg, timestamp: Date.now() }]);
      if (ttsEnabled) { setVoiceState('speaking'); speak(confirmMsg, () => { setVoiceState('wake'); startWakeListening(); }); } else { setVoiceState('wake'); startWakeListening(); }
      return;
    }
    try {
      const response = await callTimBackend([{ role: 'system', content: getSystemPrompt() }, ...messages.filter(m => m.role !== 'system').slice(-6), { role: 'user', content: `(Comando de voz) ${cmd}` }]);
      setMessages((prev) => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
      if (!open) setUnread((n) => n + 1);
      if (ttsEnabled) { setVoiceState('speaking'); speak(response, () => { setVoiceState('wake'); startWakeListening(); }); } else { setVoiceState('wake'); startWakeListening(); }
    } catch { setVoiceState('wake'); startWakeListening(); }
  }

  function toggleVoice() {
    if (voiceState !== 'off') { try { wakeRecRef.current?.stop(); } catch {} try { cmdRecRef.current?.stop(); } catch {} stopSpeaking(); setVoiceState('off'); setTranscript(''); }
    else { setVoiceState('wake'); startWakeListening(); }
  }

  useEffect(() => { return () => { try { wakeRecRef.current?.stop(); } catch {} stopSpeaking(); if (proactiveTimerRef.current) clearInterval(proactiveTimerRef.current); }; }, []);

  async function sendMessage(userText, isSystem = false) {
    setLoading(true);
    try {
      const conversation = [{ role: 'system', content: getSystemPrompt() }, ...messages.filter(m => m.role !== 'system').slice(-8), { role: 'user', content: userText }];
      const response = await callTimBackend(conversation);
      const msg = { role: 'assistant', content: response, isProactive: isSystem, timestamp: Date.now() };
      setMessages((prev) => [...prev, msg]);
      if (!open && isSystem) setUnread((n) => n + 1);
      if (ttsEnabled && voiceState !== 'off' && !isSystem) speak(response);
    } catch { setMessages((prev) => [...prev, { role: 'assistant', content: 'Sin conexion con el servidor de TIM.', timestamp: Date.now() }]); }
    finally { setLoading(false); }
  }

  async function sendProactiveMessage(trigger) {
    if (bgWorking) return;
    setBgWorking(true);
    try {
      const convo = [{ role: 'system', content: getSystemPrompt() }, ...messages.filter(m => m.role !== 'system').slice(-4), { role: 'user', content: trigger }];
      const response = await callTimBackend(convo);
      if (!response) return;
      setMessages((prev) => [...prev, { role: 'assistant', content: response, isProactive: true, timestamp: Date.now() }]);
      if (!open) setUnread((n) => n + 1);
      if (ttsEnabled && voiceState === 'wake') speak(response);
    } catch {} finally { setBgWorking(false); }
  }

  async function triggerGreeting() {
    const trafficNote = trafficEvents.length > 0 ? `Hay ${trafficEvents.length} alerta(s), +${totalTrafficDelay} min.` : 'Sin trafico.';
    await sendMessage(`Saluda brevemente como TIM. Ruta: ${routeResult?.stops.length ?? 0} paradas. Trafico: ${trafficNote}. Tono JARVIS, max 2 oraciones.`, true);
  }

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((prev) => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);
    setInput('');
    sendMessage(text, false);
  }

  function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }

  const hasHeavyTraffic = trafficEvents.some((e) => e.severity === 'heavy');
  const btnColor = hasHeavyTraffic ? 'bg-red-600 shadow-red-900/40' : trafficEvents.length > 0 ? 'bg-amber-500 shadow-amber-900/30' : voiceState !== 'off' ? 'bg-emerald-600 shadow-emerald-900/30' : 'bg-blue-600 shadow-blue-900/30';

  const voiceLabel = { off: '', wake: 'Escuchando...', command: 'Te escucho! Habla ahora...', processing: 'TIM procesando...', speaking: 'TIM hablando...' };
  const voiceBarColor = { off: '', wake: 'bg-emerald-600', command: 'bg-blue-600', processing: 'bg-amber-600', speaking: 'bg-violet-600' };

  return (
    <>
      {voiceState !== 'off' && !open && (
        <div className={`fixed bottom-24 right-5 z-[1999] flex items-center gap-2 ${voiceBarColor[voiceState]} text-white text-xs font-semibold rounded-full px-3 py-1.5 shadow-lg cursor-pointer`} onClick={() => setOpen(true)}>
          <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
          {voiceState === 'command' && transcript ? <span className="max-w-[180px] truncate italic opacity-90">"{transcript}"</span> : <span>{voiceLabel[voiceState]}</span>}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} data-testid="tim-fab" className={`fixed bottom-5 right-5 z-[2000] w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white transition-all duration-200 hover:scale-110 active:scale-95 ${btnColor}`} title="TIM - Transportation Intelligence Module">
        {open ? <ChevronDown className="w-6 h-6" /> : (
          <div className="relative">
            {voiceState === 'command' || voiceState === 'processing' ? <Mic className="w-6 h-6 animate-pulse" /> : voiceState === 'speaking' ? <Volume2 className="w-6 h-6 animate-pulse" /> : bgWorking ? <BrainCircuit className="w-6 h-6 animate-pulse" /> : <Zap className="w-6 h-6" />}
            {unread > 0 && <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] rounded-full bg-white text-gray-900 text-[10px] font-black border-2 flex items-center justify-center px-0.5 animate-bounce">{unread}</span>}
            {unread === 0 && voiceState === 'wake' && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white/80 border-2 animate-pulse" />}
          </div>
        )}
      </button>
      {open && (
        <div className="fixed bottom-24 right-5 z-[2000] w-[345px] max-w-[calc(100vw-24px)] bg-gray-950 rounded-2xl shadow-2xl border border-gray-800 flex flex-col overflow-hidden" style={{ height: 500, fontFamily: 'system-ui, sans-serif' }} data-testid="tim-panel">
          <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${voiceState === 'command' ? 'bg-blue-600 ring-2 ring-blue-400' : voiceState === 'speaking' ? 'bg-violet-600' : hasHeavyTraffic ? 'bg-red-600' : 'bg-blue-600'}`}>
              {voiceState === 'command' ? <Mic className="w-4 h-4 text-white animate-pulse" /> : voiceState === 'speaking' ? <Volume2 className="w-4 h-4 text-white animate-pulse" /> : bgWorking ? <BrainCircuit className="w-4 h-4 text-white animate-pulse" /> : <Zap className="w-4 h-4 text-white" />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white leading-tight flex items-center gap-1.5">
                TIM
                {bgWorking && <span className="text-[9px] text-blue-400 font-normal animate-pulse">analizando...</span>}
                {voiceState === 'wake' && <span className="text-[9px] text-emerald-400 font-normal">activo</span>}
              </div>
              <div className="text-[10px] text-blue-400 leading-tight">Transportation Intelligence Module</div>
            </div>
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              {trafficEvents.length > 0 && (
                <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${hasHeavyTraffic ? 'bg-red-950 border border-red-800' : 'bg-amber-950 border border-amber-800'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${hasHeavyTraffic ? 'bg-red-400' : 'bg-amber-400'}`} />
                  <span className={`text-[9px] font-bold ${hasHeavyTraffic ? 'text-red-300' : 'text-amber-300'}`}>+{totalTrafficDelay}min</span>
                </div>
              )}
              <button onClick={() => setTtsEnabled((v) => !v)} title={ttsEnabled ? 'Silenciar TIM' : 'Activar voz'} className="text-gray-500 hover:text-gray-300 transition-colors">
                {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
              {voiceSupported && (
                <button onClick={toggleVoice} data-testid="tim-voice-toggle" className={`transition-colors ${voiceState !== 'off' ? 'text-emerald-400 hover:text-emerald-300' : 'text-gray-500 hover:text-gray-300'}`}>
                  {voiceState !== 'off' ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
          </div>
          {(voiceState === 'command' || voiceState === 'processing') && (
            <div className={`px-4 py-2 shrink-0 flex items-center gap-2 ${voiceState === 'processing' ? 'bg-amber-950 border-b border-amber-900' : 'bg-blue-950 border-b border-blue-900'}`}>
              <span className="w-2 h-2 rounded-full bg-current animate-pulse shrink-0 text-blue-400" />
              <span className="text-xs text-blue-200 italic truncate flex-1">{voiceState === 'processing' ? 'Procesando comando...' : transcript || 'Escuchando tu comando...'}</span>
            </div>
          )}
          {voiceSupported && voiceState === 'off' && messages.length <= 1 && (
            <div className="mx-3 mt-2 rounded-xl bg-emerald-950 border border-emerald-800 px-3 py-2 text-[10px] text-emerald-300 flex items-center gap-2 shrink-0">
              <Mic className="w-3.5 h-3.5 shrink-0" />
              <span>Di <strong>"Oye TIM"</strong> o <strong>"Hey TIM"</strong> para comandos de voz.</span>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-24 text-gray-600 text-xs gap-2"><Loader2 className="w-4 h-4 animate-spin" /> TIM iniciando sistemas...</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mr-1.5 mt-0.5 ${msg.isProactive ? 'bg-amber-700' : 'bg-blue-700'}`}>
                    {msg.isProactive ? <BrainCircuit className="w-2.5 h-2.5 text-white" /> : <Zap className="w-2.5 h-2.5 text-white" />}
                  </div>
                )}
                <div className="flex flex-col gap-0.5 max-w-[82%]">
                  {msg.role === 'assistant' && msg.isProactive && <span className="text-[9px] text-amber-500 font-semibold ml-1">TIM - Alerta automatica</span>}
                  <div className={`rounded-2xl px-3 py-2 text-xs leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : msg.isProactive ? 'bg-amber-950 border border-amber-800 text-amber-100 rounded-bl-sm' : 'bg-gray-800 text-gray-100 rounded-bl-sm'}`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          {messages.filter(m => m.role === 'user').length === 0 && !loading && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
              {['Como va la ruta?', 'Hay trafico?', 'Como ahorro tiempo?', 'Oportunidades de venta?'].map((q) => (
                <button key={q} onClick={() => { setMessages((prev) => [...prev, { role: 'user', content: q, timestamp: Date.now() }]); sendMessage(q, false); }} className="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-full px-2.5 py-1 transition-colors">{q}</button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-900 border-t border-gray-800 shrink-0">
            {voiceSupported && (
              <button onClick={toggleVoice} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 ${voiceState !== 'off' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-400'}`}>
                {voiceState !== 'off' ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              </button>
            )}
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey} disabled={loading} data-testid="tim-input" placeholder={voiceState !== 'off' ? 'Escribe o di "Hey TIM"...' : 'Escribe a TIM...'} className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-600 rounded-xl px-3 py-2 text-xs border border-gray-700 focus:outline-none focus:border-blue-500 disabled:opacity-40" />
            <button onClick={handleSend} disabled={!input.trim() || loading} data-testid="tim-send-btn" className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0">
              {loading ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Send className="w-3.5 h-3.5 text-white" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
