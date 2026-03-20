/**
 * useHeyLau.js
 *
 * Hook de detección de palabra de activación "Hey Lau" para OperatorAgent.
 *
 * Cómo funciona:
 *  1. Corre un SpeechRecognition en modo continuous: true en segundo plano.
 *  2. Monitorea el transcript buscando las variantes de "Hey Lau".
 *  3. Al detectarla, extrae el comando que siga (si lo hay) y llama onCommand().
 *  4. Si no hay comando tras la wake word, abre el micrófono de comando 1 vez.
 *  5. Se auto-reinicia tras cada utterance para mantenerse escuchando.
 *
 * Uso en OperatorAgent.jsx:
 *
 *   import useHeyLau from "./useHeyLau";
 *
 *   const { wakeState, transcript, startWake, stopWake, supported } = useHeyLau({
 *     lang: "es-MX",           // idioma del reconocedor
 *     onWake: () => {},         // llamado cuando detecta la wake word (antes del comando)
 *     onCommand: (text) => {},  // llamado con el comando completo para procesar
 *   });
 *
 * wakeState values:
 *   "off"       → no escuchando
 *   "waiting"   → escuchando en background, esperando "Hey Lau"
 *   "triggered" → wake word detectada, esperando comando
 *   "listening" → escuchando el comando
 *   "processing"→ comando recibido, procesando
 */

import { useState, useEffect, useRef, useCallback } from "react";

// Variantes de pronunciación que se aceptan como wake word
const WAKE_WORDS = [
  "hey lau",
  "oye lau",
  "hola lau",
  "ey lau",
  "hey lou",   // pronunciación anglófona
  "hey law",   // Chrome a veces transcribe así
  "hello lau",
  "lau",       // solo el nombre (opcional — más sensible a falsos positivos)
];

export default function useHeyLau({ lang = "es-MX", onWake, onCommand } = {}) {
  const [wakeState, setWakeState] = useState("off");
  const [transcript, setTranscript]  = useState("");
  const [supported, setSupported]    = useState(false);

  const bgRecRef  = useRef(null); // Background recognizer (wake word)
  const cmdRecRef = useRef(null); // Command recognizer (single utterance)
  const stateRef  = useRef("off");
  const restartTimer = useRef(null);

  // Sync ref with state so callbacks always see the latest value
  const updateState = useCallback((s) => {
    stateRef.current = s;
    setWakeState(s);
  }, []);

  // Check browser support on mount
  useEffect(() => {
    const SRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SRec);
  }, []);

  // ── Background wake-word recognizer ────────────────────────────────────────
  const startBackground = useCallback(() => {
    const SRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SRec || stateRef.current === "off") return;

    clearTimeout(restartTimer.current);
    try { bgRecRef.current?.abort(); } catch {}

    const rec = new SRec();
    rec.lang = lang;
    rec.continuous = true;      // keep mic open
    rec.interimResults = true;  // partial results for faster detection
    rec.maxAlternatives = 3;    // consider multiple interpretations

    rec.onresult = (e) => {
      if (stateRef.current !== "waiting") return;

      let fullText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        // Check all alternatives for the wake word
        for (let j = 0; j < e.results[i].length; j++) {
          fullText += e.results[i][j].transcript.toLowerCase() + " ";
        }
      }
      fullText = fullText.trim();
      setTranscript(fullText);

      const matchedWake = WAKE_WORDS.find((w) => fullText.includes(w));
      if (matchedWake) {
        rec.abort(); // stop background listener
        const afterWake = fullText.slice(fullText.indexOf(matchedWake) + matchedWake.length).trim();
        handleWakeDetected(afterWake);
      }
    };

    rec.onend = () => {
      // Auto-restart if still in waiting mode (browser ends after silence)
      if (stateRef.current === "waiting") {
        restartTimer.current = setTimeout(startBackground, 200);
      }
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed") { updateState("off"); return; }
      if (stateRef.current === "waiting") {
        restartTimer.current = setTimeout(startBackground, 1000);
      }
    };

    bgRecRef.current = rec;
    try { rec.start(); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // ── Wake word detected ─────────────────────────────────────────────────────
  const handleWakeDetected = useCallback((commandSuffix) => {
    updateState("triggered");
    setTranscript("");
    onWake?.();

    // If there's already a command after the wake word, process it directly
    if (commandSuffix && commandSuffix.length > 2) {
      setTimeout(() => {
        updateState("processing");
        setTranscript(commandSuffix);
        onCommand?.(commandSuffix);
        // Return to waiting after processing
        setTimeout(() => { updateState("waiting"); startBackground(); }, 2000);
      }, 300);
      return;
    }

    // Otherwise open single-utterance command listener
    setTimeout(startCommandListen, 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onWake, onCommand]);

  // ── Single-utterance command recognizer ────────────────────────────────────
  const startCommandListen = useCallback(() => {
    const SRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SRec) return;

    updateState("listening");

    const rec = new SRec();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalText = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setTranscript(finalText || interim);
    };

    rec.onend = () => {
      const cmd = (finalText || "").trim();
      if (cmd.length > 0) {
        updateState("processing");
        setTranscript(cmd);
        onCommand?.(cmd);
        // Back to waiting
        setTimeout(() => {
          updateState("waiting");
          setTranscript("");
          startBackground();
        }, 2000);
      } else {
        // Nothing heard — go back to waiting
        updateState("waiting");
        setTranscript("");
        startBackground();
      }
    };

    rec.onerror = () => {
      updateState("waiting");
      startBackground();
    };

    cmdRecRef.current = rec;
    try { rec.start(); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, onCommand]);

  // ── Public API ─────────────────────────────────────────────────────────────
  const startWake = useCallback(() => {
    if (!supported) return;
    updateState("waiting");
    setTranscript("");
    startBackground();
  }, [supported, updateState, startBackground]);

  const stopWake = useCallback(() => {
    clearTimeout(restartTimer.current);
    try { bgRecRef.current?.abort(); } catch {}
    try { cmdRecRef.current?.abort(); } catch {}
    updateState("off");
    setTranscript("");
  }, [updateState]);

  // Cleanup on unmount
  useEffect(() => () => stopWake(), [stopWake]);

  return { wakeState, transcript, startWake, stopWake, supported };
}
