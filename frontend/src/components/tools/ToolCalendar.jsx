import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

const DAYS  = ["Lu","Ma","Mi","Ju","Vi","Sá","Do"];
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const STORAGE_KEY = "crm_mini_calendar_events";

function loadEvents() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveEvents(ev) { localStorage.setItem(STORAGE_KEY, JSON.stringify(ev)); }

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstDayOfMonth(y, m) {
  const d = new Date(y, m, 1).getDay();
  return d === 0 ? 6 : d - 1; // Mon=0
}

const DOT_COLORS = ["bg-sky-400","bg-rose-400","bg-emerald-400","bg-violet-400","bg-amber-400"];

export default function ToolCalendar() {
  const today = new Date();
  const [view, setView]     = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSel]  = useState(null); // "YYYY-MM-DD"
  const [events, setEvents] = useState(loadEvents);
  const [input,   setInput] = useState("");

  useEffect(() => saveEvents(events), [events]);

  const { y, m } = view;
  const totalDays  = daysInMonth(y, m);
  const firstDay   = firstDayOfMonth(y, m);

  const prev = () => setView(v => v.m === 0 ? { y: v.y-1, m: 11 } : { y: v.y, m: v.m-1 });
  const next = () => setView(v => v.m === 11 ? { y: v.y+1, m: 0 } : { y: v.y, m: v.m+1 });

  const dateKey = (day) => `${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

  const addEvent = () => {
    if (!selected || !input.trim()) return;
    setEvents(ev => {
      const list = ev[selected] || [];
      const colorIdx = list.length % DOT_COLORS.length;
      return { ...ev, [selected]: [...list, { id: Date.now(), text: input.trim(), colorIdx }] };
    });
    setInput("");
  };

  const removeEvent = (key, id) =>
    setEvents(ev => ({ ...ev, [key]: (ev[key] || []).filter(e => e.id !== id) }));

  const todayKey = dateKey.call(null, today.getDate()).replace(
    `${y}-${String(m+1).padStart(2,"0")}`,
    `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`
  );
  // simpler: just compute today's key correctly
  const todayDateKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  const selEvents = selected ? (events[selected] || []) : [];

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prev} className="h-8 w-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
          <ChevronLeft className="h-4 w-4 text-slate-600" />
        </button>
        <span className="font-bold text-slate-800 text-base">
          {MONTHS[m]} {y}
        </span>
        <button onClick={next} className="h-8 w-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
          <ChevronRight className="h-4 w-4 text-slate-600" />
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 gap-0.5 mb-4">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const key        = dateKey(day);
          const isToday    = key === todayDateKey;
          const isSel      = key === selected;
          const hasEvents  = (events[key] || []).length > 0;
          return (
            <button
              key={key}
              onClick={() => setSel(isSel ? null : key)}
              className={`
                relative h-9 w-full rounded-lg flex flex-col items-center justify-center text-sm font-medium transition-colors
                ${isToday && !isSel ? "bg-sky-100 text-sky-700 font-bold" : ""}
                ${isSel ? "bg-sky-500 text-white shadow" : "hover:bg-slate-100 text-slate-700"}
              `}
            >
              {day}
              {hasEvents && (
                <div className={`absolute bottom-1 w-1 h-1 rounded-full ${isSel ? "bg-white" : "bg-sky-400"}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Events panel */}
      {selected && (
        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600">
              Eventos – {selected}
            </span>
          </div>

          {selEvents.length === 0 && (
            <p className="text-xs text-slate-400 mb-3">Sin eventos. Agrega uno.</p>
          )}

          <div className="space-y-1.5 mb-3">
            {selEvents.map(ev => (
              <div key={ev.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2 py-1.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLORS[ev.colorIdx]}`} />
                <span className="text-sm text-slate-700 flex-1">{ev.text}</span>
                <button onClick={() => removeEvent(selected, ev.id)} className="text-slate-300 hover:text-rose-400 transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addEvent()}
              placeholder="Nuevo evento..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 transition"
            />
            <button
              onClick={addEvent}
              className="h-9 w-9 bg-sky-500 hover:bg-sky-600 text-white rounded-lg flex items-center justify-center transition-colors active:scale-95"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}