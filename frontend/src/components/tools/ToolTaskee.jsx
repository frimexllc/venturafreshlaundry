import { useState, useEffect } from "react";
import { Plus, Trash2, Check, Circle, Flag } from "lucide-react";

const STORAGE_KEY = "crm_taskee";

const PRIORITY = {
  high:   { label: "Alta",  color: "text-rose-500",   bg: "bg-rose-50",   border: "border-rose-200",   dot: "bg-rose-400"   },
  medium: { label: "Media", color: "text-amber-500",  bg: "bg-amber-50",  border: "border-amber-200",  dot: "bg-amber-400"  },
  low:    { label: "Baja",  color: "text-emerald-500",bg: "bg-emerald-50",border: "border-emerald-200",dot: "bg-emerald-400" },
};

function loadTasks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveTasks(t) { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); }

export default function ToolTaskee() {
  const [tasks,    setTasks]    = useState(loadTasks);
  const [input,    setInput]    = useState("");
  const [priority, setPriority] = useState("medium");
  const [filter,   setFilter]   = useState("all"); // all | pending | done

  useEffect(() => saveTasks(tasks), [tasks]);

  const addTask = () => {
    if (!input.trim()) return;
    const t = { id: Date.now(), text: input.trim(), done: false, priority, created: Date.now() };
    setTasks(ts => [t, ...ts]);
    setInput("");
  };

  const toggle  = (id) => setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const remove  = (id) => setTasks(ts => ts.filter(t => t.id !== id));
  const clearDone = () => setTasks(ts => ts.filter(t => !t.done));

  const filtered = tasks.filter(t =>
    filter === "all" ? true : filter === "pending" ? !t.done : t.done
  );

  const doneCount    = tasks.filter(t => t.done).length;
  const pendingCount = tasks.filter(t => !t.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <div className="p-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-bold text-violet-600 w-10 text-right">{pct}%</span>
        <span className="text-xs text-slate-400">{doneCount}/{tasks.length}</span>
      </div>

      {/* Input */}
      <div className="flex gap-2 mb-4">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTask()}
          placeholder="Nueva tarea..."
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
        />
        <button
          onClick={addTask}
          className="h-10 w-10 bg-violet-500 hover:bg-violet-600 text-white rounded-xl flex items-center justify-center transition-colors active:scale-95 flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Priority selector */}
      <div className="flex gap-1.5 mb-4">
        {Object.entries(PRIORITY).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setPriority(k)}
            className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              priority === k
                ? `${v.bg} ${v.border} ${v.color}`
                : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            <Flag className="h-3 w-3" /> {v.label}
          </button>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 mb-4">
        {[["all","Todas"], ["pending",`Pendientes (${pendingCount})`], ["done",`Listas (${doneCount})`]].map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors ${
              filter === f ? "bg-white text-violet-600 shadow" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            <div className="text-3xl mb-1">✅</div>
            <p className="text-xs">{filter === "done" ? "Sin tareas completadas" : "¡Sin tareas pendientes!"}</p>
          </div>
        )}
        {filtered.map(task => {
          const p = PRIORITY[task.priority];
          return (
            <div
              key={task.id}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all ${
                task.done ? "opacity-60 bg-slate-50 border-slate-100" : `${p.bg} ${p.border}`
              }`}
            >
              <button
                onClick={() => toggle(task.id)}
                className={`flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  task.done ? "bg-violet-500 border-violet-500 text-white" : `border-slate-300 hover:border-violet-400`
                }`}
              >
                {task.done && <Check className="h-3 w-3" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${task.done ? "line-through text-slate-400" : "text-slate-800"}`}>
                  {task.text}
                </p>
              </div>
              <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${p.dot}`} />
              <button
                onClick={() => remove(task.id)}
                className="flex-shrink-0 text-slate-300 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Clear done */}
      {doneCount > 0 && (
        <div className="mt-3 text-right">
          <button
            onClick={clearDone}
            className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
          >
            Limpiar completadas ({doneCount})
          </button>
        </div>
      )}
    </div>
  );
}