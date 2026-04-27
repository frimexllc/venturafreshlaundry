import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, TimerReset, AlarmClock, Hourglass } from "lucide-react";

const PRESETS = [
  { label: "5 min",  s: 300  },
  { label: "15 min", s: 900  },
  { label: "25 min", s: 1500 }, // pomodoro
  { label: "30 min", s: 1800 },
  { label: "1 hr",   s: 3600 },
];

function fmt(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

export default function ToolTimer() {
  const [mode,       setMode]       = useState("countdown"); // "countdown" | "stopwatch"
  const [remaining,  setRemaining]  = useState(25 * 60);
  const [target,     setTarget]     = useState(25 * 60);
  const [running,    setRunning]    = useState(false);
  const [elapsed,    setElapsed]    = useState(0);           // stopwatch
  const [finished,   setFinished]   = useState(false);

  // Custom input
  const [hInput, setHInput] = useState("0");
  const [mInput, setMInput] = useState("25");
  const [sInput, setSInput] = useState("0");

  const intervalRef = useRef(null);
  const beepRef     = useRef(null);

  const playBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 200, 400].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay / 1000);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay / 1000 + 0.3);
        osc.start(ctx.currentTime + delay / 1000);
        osc.stop(ctx.currentTime + delay / 1000 + 0.3);
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      if (mode === "countdown") {
        setRemaining(r => {
          if (r <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            setFinished(true);
            playBeep();
            return 0;
          }
          return r - 1;
        });
      } else {
        setElapsed(e => e + 1);
      }
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, mode, playBeep]);

  const applyCustom = () => {
    const total = parseInt(hInput||0)*3600 + parseInt(mInput||0)*60 + parseInt(sInput||0);
    if (total > 0) { setTarget(total); setRemaining(total); setRunning(false); setFinished(false); }
  };

  const applyPreset = (s) => { setTarget(s); setRemaining(s); setRunning(false); setFinished(false); };

  const reset = () => {
    setRunning(false); setFinished(false);
    if (mode === "countdown") setRemaining(target);
    else setElapsed(0);
  };

  const progress = mode === "countdown"
    ? target > 0 ? (1 - remaining / target) : 0
    : 0;

  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="p-4">
      {/* Mode toggle */}
      <div className="flex bg-slate-100 rounded-xl p-1 mb-5 gap-1">
        {[["countdown","Cuenta regresiva", Hourglass], ["stopwatch","Cronómetro", AlarmClock]].map(([m, label, Icon]) => (
          <button
            key={m}
            onClick={() => { setMode(m); setRunning(false); setElapsed(0); setRemaining(target); setFinished(false); }}
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold py-2 rounded-lg transition-colors ${
              mode === m ? "bg-white text-amber-600 shadow" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Ring display */}
      <div className="flex justify-center mb-5">
        <div className="relative">
          <svg width="128" height="128" className="-rotate-90">
            <circle cx="64" cy="64" r="54" fill="none" stroke="#e2e8f0" strokeWidth="8" />
            <circle
              cx="64" cy="64" r="54" fill="none"
              stroke={finished ? "#f59e0b" : "#f59e0b"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={mode === "countdown" ? dashOffset : 0}
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-mono font-bold tabular-nums ${finished ? "text-amber-500 animate-pulse" : "text-slate-800"}`}>
              {mode === "countdown" ? fmt(remaining) : fmt(elapsed)}
            </span>
            {finished && <span className="text-xs text-amber-500 font-semibold">¡Tiempo!</span>}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-3 mb-5">
        <button onClick={reset} className="h-11 w-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors active:scale-95">
          <RotateCcw className="h-5 w-5" />
        </button>
        <button
          onClick={() => { setRunning(r => !r); setFinished(false); }}
          className={`h-11 w-20 rounded-xl flex items-center justify-center gap-2 font-semibold text-white transition-colors active:scale-95 ${
            running ? "bg-rose-500 hover:bg-rose-600" : "bg-amber-500 hover:bg-amber-600"
          }`}
        >
          {running ? <><Pause className="h-4 w-4" /> Pausar</> : <><Play className="h-4 w-4" /> Iniciar</>}
        </button>
      </div>

      {/* Presets (countdown only) */}
      {mode === "countdown" && (
        <>
          <div className="flex gap-1.5 flex-wrap justify-center mb-4">
            {PRESETS.map(p => (
              <button
                key={p.s}
                onClick={() => applyPreset(p.s)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  target === p.s ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom time */}
          <div className="flex items-center gap-2 justify-center">
            {[["h", hInput, setHInput], ["m", mInput, setMInput], ["s", sInput, setSInput]].map(([lbl, val, set]) => (
              <div key={lbl} className="flex items-center gap-1">
                <input
                  type="number" min="0" max={lbl === "h" ? "99" : "59"}
                  value={val}
                  onChange={e => set(e.target.value)}
                  className="w-14 text-center bg-slate-50 border border-slate-200 rounded-lg py-1.5 text-sm font-mono outline-none focus:border-amber-400"
                />
                <span className="text-xs text-slate-400">{lbl}</span>
              </div>
            ))}
            <button
              onClick={applyCustom}
              className="flex items-center gap-1 text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-700 px-3 py-2 rounded-lg transition-colors"
            >
              <TimerReset className="h-3.5 w-3.5" /> Set
            </button>
          </div>
        </>
      )}
    </div>
  );
}