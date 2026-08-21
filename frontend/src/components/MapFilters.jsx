// src/components/MapFilters.jsx
// Filtros simplificados del Logistics Map — solo fecha y ventana horaria
import { useState, useEffect, useCallback } from "react";
import { Calendar, X, Clock } from "lucide-react";

const TIME_OPTIONS = [
  { value: "morning", label: "Mañana (8-12)" },
  { value: "afternoon", label: "Tarde (14-18)" },
];

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
}

function MapFilters({ onFilterChange, activeFilters = {} }) {
  // Sin fecha por defecto: al montar no se filtra por día, se ven órdenes
  // de todos los días. El botón "HOY" sigue disponible para saltar al día
  // actual cuando el operador lo quiera explícitamente.
  const [date, setDate] = useState(activeFilters.date ?? "");
  const [timeWindow, setTimeWindow] = useState(activeFilters.time_window || "");

  // Sincronizar con props (controlled)
  useEffect(() => {
    if (activeFilters.date !== undefined) setDate(activeFilters.date || "");
    if (activeFilters.time_window !== undefined) setTimeWindow(activeFilters.time_window || "");
  }, [activeFilters]);

  // Aplicar al montar (sin fecha: no se filtra nada de entrada)
  useEffect(() => {
    onFilterChange({
      date,
      time_window: timeWindow,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = useCallback((updates) => {
    const next = {
      date,
      time_window: timeWindow,
      ...updates,
    };
    onFilterChange(next);
  }, [date, timeWindow, onFilterChange]);

  const isDefault = !date && !timeWindow;

  return (
    <div
      className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700 px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-2 sm:gap-3"
      data-testid="logistics-map-filters"
    >
      {/* Etiqueta */}
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">
        Filtros
      </span>

      {/* ── Fecha ── */}
      <div className="flex items-center gap-1.5">
        <Calendar className="w-4 h-4 text-slate-400" />
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            apply({ date: e.target.value });
          }}
          data-testid="filter-date"
          className="text-xs outline-none border border-slate-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300"
        />
        {date && (
          <button
            onClick={() => {
              setDate("");
              apply({ date: "" });
            }}
            className="text-[10px] font-semibold text-slate-400 hover:text-red-500 px-1.5"
            title="Ver todos los días"
            data-testid="filter-date-clear"
          >
            TODOS
          </button>
        )}
        <button
          onClick={() => {
            const t = todayISO();
            setDate(t);
            apply({ date: t });
          }}
          className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 px-1.5"
          title="Hoy"
          data-testid="filter-date-today"
        >
          HOY
        </button>
      </div>

      {/* Separador */}
      <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-gray-700" />

      {/* ── Ventana horaria ── */}
      <div className="flex items-center gap-1">
        <Clock className="w-4 h-4 text-slate-400" />
        {TIME_OPTIONS.map((opt) => {
          const active = timeWindow === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => {
                const next = active ? "" : opt.value;
                setTimeWindow(next);
                apply({ time_window: next });
              }}
              data-testid={`filter-time-${opt.value}`}
              className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
                active
                  ? "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-white dark:bg-gray-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-gray-600 hover:border-slate-300"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* ── Limpiar filtros ── */}
      {!isDefault && (
        <button
          onClick={() => {
            setDate("");
            setTimeWindow("");
            onFilterChange({ date: "", time_window: "" });
          }}
          data-testid="filter-clear"
          className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors"
          title="Restablecer filtros"
        >
          <X className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Limpiar</span>
        </button>
      )}
    </div>
  );
}

export default MapFilters;