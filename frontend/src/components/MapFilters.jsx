// src/components/MapFilters.jsx
import { useState, useEffect } from "react";
import { Calendar, X } from "lucide-react";

function MapFilters({ onFilterChange, activeFilters = {} }) {
  // Sincronizar estado local con props
  const [date, setDate] = useState(activeFilters.date || "");
  const [timeWindow, setTimeWindow] = useState(activeFilters.time_window || "");

  useEffect(() => {
    setDate(activeFilters.date || "");
    setTimeWindow(activeFilters.time_window || "");
  }, [activeFilters]);

  const apply = (d, tw) => onFilterChange({ date: d, time_window: tw });

  return (
    <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2 sm:gap-4">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        Filtros
      </span>

      {/* Filtro de Fecha */}
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-slate-400" />
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            apply(e.target.value, timeWindow);
          }}
          className="text-sm outline-none border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 transition-all"
        />
      </div>

      {/* Filtro de Horario */}
      <div className="flex items-center gap-1">
        {[
          { label: "AM", value: "morning" },
          { label: "PM", value: "afternoon" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              const next = timeWindow === opt.value ? "" : opt.value;
              setTimeWindow(next);
              apply(date, next);
            }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
              timeWindow === opt.value
                ? "bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm"
                : "bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Botón Limpiar */}
      {(date || timeWindow) && (
        <button
          onClick={() => {
            setDate("");
            setTimeWindow("");
            apply("", "");
          }}
          className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors"
          title="Limpiar filtros"
        >
          <X className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Limpiar</span>
        </button>
      )}
    </div>
  );
}

export default MapFilters;