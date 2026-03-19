import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Mic, MicOff, MessageSquare, Minimize2, Volume2, VolumeX, X } from "lucide-react";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SESSION_STORAGE_KEY = "vfl_voice_assistant_session_id";

const TypingDots = () => (
  <div className="flex items-center gap-1 py-1" data-testid="voice-assistant-typing-dots">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-2 h-2 rounded-full bg-sky-400"
        style={{ animation: `voice-assistant-bounce 1.2s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }}
      />
    ))}
    <style>{`@keyframes voice-assistant-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}`}</style>
  </div>
);

const Waveform = ({ active }) => (
  <div className="flex items-center justify-center gap-[3px] h-7" data-testid="voice-assistant-waveform">
    {Array.from({ length: 10 }).map((_, i) => (
      <span
        key={i}
        className="rounded-full bg-sky-400"
        style={{
          width: 3,
          height: active ? `${8 + Math.sin(i * 0.7) * 8}px` : "3px",
          opacity: active ? 0.9 : 0.25,
          animation: active ? `voice-assistant-wave ${0.6 + i * 0.06}s ease-in-out infinite alternate` : "none",
          animationDelay: `${i * 0.05}s`
        }}
      />
    ))}
    <style>{`@keyframes voice-assistant-wave{from{height:4px}to{height:20px}}`}</style>
  </div>
);

const createSessionId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `vfl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const shouldRenderOnRoute = (pathname) => {
  if (!pathname) return true;
  if (pathname.startsWith("/admin")) return false;
  if (pathname === "/login") return false;
  return true;
};

const normalizeMessages = (messages = []) => {
  return messages
    .filter((message) => message?.role && message?.content)
    .map((message, index) => ({
      id: `${message.created_at || Date.now()}-${index}`,
      role: message.role,
      content: message.content
    }));
};

const PublicVoiceAssistantWidget = () => {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(true);

  const sessionIdRef = useRef(localStorage.getItem(SESSION_STORAGE_KEY) || "");
  const recognitionRef = useRef(null);
  const speechRef = useRef(window.speechSynthesis);
  const messagesEndRef = useRef(null);
  const hasLoadedSessionRef = useRef(false);

  const quickPrompts = useMemo(() => [
    t("Pickup and delivery pricing", "Precios de pickup y delivery"),
    t("Tell me about memberships", "Háblame de membresías"),
    t("I am an Airbnb host", "Soy host de Airbnb"),
    t("What are your self service hours?", "¿Cuáles son sus horarios de autoservicio?")
  ], [t]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) setVoiceSupported(false);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const loadSession = useCallback(async () => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = createSessionId();
      localStorage.setItem(SESSION_STORAGE_KEY, sessionIdRef.current);
    }

    try {
      const response = await fetch(`${API}/public/voice-assistant/session/${sessionIdRef.current}`);
      const payload = await response.json();
      const normalized = normalizeMessages(payload.messages || []);
      if (normalized.length > 0) {
        setMessages(normalized);
      } else {
        setMessages([
          {
            id: `greeting-${Date.now()}`,
            role: "assistant",
            content: t(
              "Hi! I am Ventura, your laundry concierge. I can help you choose the best service or membership. What are you looking for today?",
              "¡Hola! Soy Ventura, tu concierge de lavandería. Te ayudo a elegir el mejor servicio o membresía. ¿Qué buscas hoy?"
            )
          }
        ]);
      }
    } catch (error) {
      setMessages([
        {
          id: `greeting-fallback-${Date.now()}`,
          role: "assistant",
          content: t(
            "Hi! I am Ventura. I can help with pricing, memberships, and scheduling. What would you like to know?",
            "¡Hola! Soy Ventura. Puedo ayudarte con precios, membresías y programación. ¿Qué te gustaría saber?"
          )
        }
      ]);
    }
  }, [t]);

  useEffect(() => {
    if (!open || hasLoadedSessionRef.current) return;
    hasLoadedSessionRef.current = true;
    loadSession();
  }, [open, loadSession]);

  const speak = useCallback((text) => {
    if (muted || !speechRef.current || !text) return;

    speechRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 1.02;
    utterance.volume = 1;

    const voices = speechRef.current.getVoices() || [];
    const preferred = locale === "es"
      ? voices.find((voice) => voice.lang.toLowerCase().startsWith("es"))
      : voices.find((voice) => voice.lang.toLowerCase().startsWith("en"));
    if (preferred) utterance.voice = preferred;
    utterance.lang = locale === "es" ? "es-MX" : "en-US";

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechRef.current.speak(utterance);
  }, [locale, muted]);

  const stopSpeaking = useCallback(() => {
    speechRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  const sendMessage = useCallback(async (text) => {
    if (!text?.trim()) return;

    setIsThinking(true);
    setInputText("");
    setMessages((prev) => ([
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: text.trim() }
    ]));

    if (!sessionIdRef.current) {
      sessionIdRef.current = createSessionId();
      localStorage.setItem(SESSION_STORAGE_KEY, sessionIdRef.current);
    }

    try {
      const response = await fetch(`${API}/public/voice-assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          session_id: sessionIdRef.current,
          locale
        })
      });

      if (!response.ok) throw new Error("assistant_error");

      const payload = await response.json();
      if (payload.session_id) {
        sessionIdRef.current = payload.session_id;
        localStorage.setItem(SESSION_STORAGE_KEY, payload.session_id);
      }

      const normalized = normalizeMessages(payload.messages || []);
      if (normalized.length > 0) {
        setMessages(normalized);
      } else if (payload.reply) {
        setMessages((prev) => ([...prev, { id: `assistant-${Date.now()}`, role: "assistant", content: payload.reply }]));
      }

      if (payload.reply) speak(payload.reply);
    } catch (error) {
      const fallback = t(
        "I am having trouble connecting right now. You can call us at (805) 836-8872 and we will help you right away.",
        "Estoy teniendo problemas de conexión ahora mismo. Puedes llamarnos al (805) 836-8872 y te ayudamos de inmediato."
      );
      setMessages((prev) => ([...prev, { id: `assistant-error-${Date.now()}`, role: "assistant", content: fallback }]));
      speak(fallback);
    } finally {
      setIsThinking(false);
    }
  }, [locale, speak, t]);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    stopSpeaking();
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = locale === "es" ? "es-MX" : "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript("");
    };
    recognition.onresult = (event) => {
      const value = Array.from(event.results).map((result) => result[0].transcript).join("");
      setTranscript(value);
    };
    recognition.onerror = () => {
      setIsListening(false);
      setTranscript("");
    };
    recognition.onend = () => {
      setIsListening(false);
      if (transcript.trim()) sendMessage(transcript.trim());
      setTranscript("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [locale, sendMessage, stopSpeaking, transcript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[90] w-14 h-14 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-xl shadow-sky-400/30 flex items-center justify-center hover:scale-105 transition-transform"
          data-testid="public-voice-assistant-open-button"
          aria-label={t("Open AI voice assistant", "Abrir asistente de voz")}
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div className={`fixed bottom-6 right-6 z-[95] ${minimized ? "w-72" : "w-[360px] sm:w-[410px]"}`} data-testid="public-voice-assistant-panel">
          <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-t-2xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-sm" data-testid="public-voice-assistant-title">Ventura AI</p>
              <p className="text-white/75 text-xs" data-testid="public-voice-assistant-status-text">
                {isListening ? t("Listening", "Escuchando") : isThinking ? t("Thinking", "Pensando") : isSpeaking ? t("Speaking", "Hablando") : t("Laundry concierge", "Concierge de lavandería")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setMuted((prev) => !prev); if (!muted) stopSpeaking(); }} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center" data-testid="public-voice-assistant-mute-button">
                {muted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
              </button>
              <button onClick={() => setMinimized((prev) => !prev)} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center" data-testid="public-voice-assistant-minimize-button">
                <Minimize2 className="w-4 h-4 text-white" />
              </button>
              <button onClick={() => { stopSpeaking(); stopListening(); setOpen(false); }} className="w-8 h-8 rounded-full bg-white/15 hover:bg-red-400/70 flex items-center justify-center" data-testid="public-voice-assistant-close-button">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {!minimized && (
            <div className="bg-white border border-slate-200 border-t-0 rounded-b-2xl flex flex-col" style={{ height: 430 }}>
              <div className="flex-1 overflow-y-auto px-4 py-4" data-testid="public-voice-assistant-messages-list">
                {messages.map((message) => (
                  <div key={message.id} className={`mb-3 flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${message.role === "assistant" ? "bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-sm" : "bg-sky-600 text-white rounded-tr-sm"}`} data-testid={`public-voice-assistant-message-${message.role}`}>
                      {message.content}
                    </div>
                  </div>
                ))}

                {isThinking && (
                  <div className="mb-3 flex justify-start">
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                      <TypingDots />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {(isListening || isSpeaking) && (
                <div className="mx-4 mb-2 px-3 py-2 rounded-xl border border-sky-100 bg-sky-50 flex items-center gap-3" data-testid="public-voice-assistant-voice-state">
                  <Waveform active={true} />
                  <p className="text-xs text-sky-600 font-semibold">{isListening ? transcript || t("Listening...", "Escuchando...") : t("Speaking...", "Hablando...")}</p>
                </div>
              )}

              <div className="border-t border-slate-100 p-3 bg-slate-50/70 flex items-center gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && sendMessage(inputText)}
                  placeholder={t("Type a message...", "Escribe un mensaje...")}
                  className="flex-1 h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400"
                  data-testid="public-voice-assistant-input"
                />
                <button
                  onClick={() => sendMessage(inputText)}
                  disabled={!inputText.trim() || isThinking}
                  className="w-10 h-10 rounded-xl bg-sky-600 text-white disabled:opacity-40"
                  data-testid="public-voice-assistant-send-button"
                >
                  ➤
                </button>
                {voiceSupported && (
                  <button
                    onClick={isListening ? stopListening : startListening}
                    disabled={isThinking || isSpeaking}
                    className={`w-10 h-10 rounded-xl text-white ${isListening ? "bg-red-500" : "bg-sky-600"} disabled:opacity-40`}
                    data-testid="public-voice-assistant-mic-button"
                  >
                    {isListening ? <MicOff className="w-4 h-4 mx-auto" /> : <Mic className="w-4 h-4 mx-auto" />}
                  </button>
                )}
              </div>

              {messages.length <= 1 && !isThinking && (
                <div className="px-3 pb-3 flex flex-wrap gap-1.5" data-testid="public-voice-assistant-quick-prompts">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="text-[11px] font-semibold text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-full px-2.5 py-1"
                      data-testid={`public-voice-assistant-quick-${prompt.slice(0, 14).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default function PublicVoiceAssistant() {
  const location = useLocation();
  if (!shouldRenderOnRoute(location.pathname)) return null;
  return <PublicVoiceAssistantWidget />;
}
