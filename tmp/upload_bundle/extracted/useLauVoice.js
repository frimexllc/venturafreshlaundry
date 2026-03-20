/**
 * useLauVoice.js
 *
 * Hook para que Lau hable usando Web Speech API (SpeechSynthesis).
 *
 * Uso:
 *   const { speak, stop, speaking, voices, selectedVoice, setSelectedVoice } = useLauVoice();
 *
 *   // Hablar:
 *   speak("La orden ab12 ha sido confirmada");
 *
 *   // Detener:
 *   stop();
 *
 * Configuración recomendada de voces (en orden de preferencia):
 *   1. "Paulina" (macOS/iOS — español mexicano, la más natural)
 *   2. "Monica" (macOS — español)
 *   3. "Google español de Estados Unidos" (Chrome)
 *   4. "Microsoft Sabina" (Edge — español México)
 *   5. Cualquier voz en es-MX o es-US
 *   6. Fallback: primera voz disponible
 */

import { useState, useEffect, useRef, useCallback } from "react";

// Preferred voice name substrings (case-insensitive, ordered by priority)
const PREFERRED_VOICES = [
  "paulina",     // macOS es-MX — sounds most natural
  "monica",      // macOS es
  "sabina",      // Microsoft Edge es-MX
  "google español de estados unidos",
  "google español",
  "es-mx",
  "es-us",
  "es-",
];

function pickBestVoice(voices) {
  if (!voices.length) return null;
  for (const pref of PREFERRED_VOICES) {
    const match = voices.find((v) =>
      v.name.toLowerCase().includes(pref) ||
      v.lang.toLowerCase().includes(pref)
    );
    if (match) return match;
  }
  // Fallback: any Spanish voice
  const any = voices.find((v) => v.lang.startsWith("es"));
  return any || voices[0];
}

export default function useLauVoice({
  defaultRate  = 1.0,
  defaultPitch = 1.05,
  defaultVolume = 1.0,
} = {}) {
  const [voices, setVoices]             = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [speaking, setSpeaking]         = useState(false);
  const [rate, setRate]                 = useState(defaultRate);
  const [pitch, setPitch]               = useState(defaultPitch);
  const [volume, setVolume]             = useState(defaultVolume);
  const [supported, setSupported]       = useState(false);

  const uttRef = useRef(null);

  // Load voices (async on some browsers)
  useEffect(() => {
    if (!window.speechSynthesis) return;
    setSupported(true);

    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        setVoices(v);
        setSelectedVoice((prev) => prev || pickBestVoice(v));
      }
    };

    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Clean up on unmount
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  /**
   * speak(text, options)
   *
   * @param {string}   text       — what Lau says
   * @param {object}   options
   *   onStart  () → void
   *   onEnd    () → void
   *   onError  () → void
   *   voice    SpeechSynthesisVoice  (override for this call)
   *   rate     number
   *   pitch    number
   */
  const speak = useCallback((text, { onStart, onEnd, onError, voice, rate: r, pitch: p, volume: vol } = {}) => {
    if (!window.speechSynthesis || !text) return;

    // Cancel any current speech
    window.speechSynthesis.cancel();

    // Small delay — Chrome needs a tick after cancel()
    setTimeout(() => {
      const utt = new SpeechSynthesisUtterance(text);
      utt.voice  = voice || selectedVoice;
      utt.rate   = r !== undefined ? r : rate;
      utt.pitch  = p !== undefined ? p : pitch;
      utt.volume = vol !== undefined ? vol : volume;
      utt.lang   = utt.voice?.lang || "es-MX";

      utt.onstart = () => { setSpeaking(true); onStart?.(); };
      utt.onend   = () => { setSpeaking(false); onEnd?.(); };
      utt.onerror = (e) => {
        // "interrupted" is not a real error — it happens when we cancel()
        if (e.error !== "interrupted") { setSpeaking(false); onError?.(e); }
      };

      uttRef.current = utt;
      window.speechSynthesis.speak(utt);
    }, 60);
  }, [selectedVoice, rate, pitch, volume]);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return {
    speak,
    stop,
    speaking,
    supported,
    voices,
    selectedVoice,
    setSelectedVoice,
    rate, setRate,
    pitch, setPitch,
    volume, setVolume,
  };
}
