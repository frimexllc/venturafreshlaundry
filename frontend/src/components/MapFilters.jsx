// src/components/MapFilters.jsx
// Filtros profesionales del Logistics Map — sincronizados con el backend
// Soporta: fecha (default hoy), service_type, time_window y phase (pickup/delivery/both)
import { useState, useEffect, useCallback } from "react";
import { Calendar, X, Truck, ShoppingBag, Home, Building2, ArrowUpFromLine, ArrowDownToLine } from "lucide-react";

const SERVICE_OPTIONS = [
  { value: "all", label: "Todos", icon: null, color: "indigo" },
  { value: "pickup-delivery", label: "P&D", icon: Truck, color: "blue" },
  { value: "airbnb", label: "Airbnb", icon: Home, color: "amber" },
  { value: "b2b", label: "B2B", icon: Building2, color: "violet" },
  { value: "wash-fold", label: "W&F", icon: ShoppingBag, color: "emerald" },
];

const TIME_OPTIONS = [
  { value: "morning", label: "AM (6–12)" },
  { value: "afternoon", label: "PM (12–18)" },
  { value: "evening", label: "Noche (18–22)" },
];

const PHASE_OPTIONS = [
  { value: "both", label: "Ambos", icon: null },
  { value: "pickup", label: "Recoger", icon: ArrowUpFromLine },
  { value: "delivery", label: "Entregar", icon: ArrowDownToLine },
];

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
}

function MapFilters({ onFilterChange, activeFilters = {} }) {
  // Inicializar con HOY por defecto
  const [date, setDate] = useState(activeFilters.date || todayISO());
  const [timeWindow, setTimeWindow] = useState(activeFilters.time_window || "");
  const [serviceType, setServiceType] = useState(activeFilters.service_type || "all");
  const [phase, setPhase] = useState(activeFilters.phase || "both");

  // Sincronizar con props (controlled)
  useEffect(() => {
    if (activeFilters.date !== undefined) setDate(activeFilters.date || todayISO());
    if (activeFilters.time_window !== undefined) setTimeWindow(activeFilters.time_window || "");
    if (activeFilters.service_type !== undefined) setServiceType(activeFilters.service_type || "all");
    if (activeFilters.phase !== undefined) setPhase(activeFilters.phase || "both");
  }, [activeFilters]);

  // Aplicar al montar (auto-hoy)
  useEffect(() => {
    onFilterChange({
      date,
      time_window: timeWindow,
      service_type: serviceType,
      phase,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = useCallback((updates) => {
    const next = {
      date,
      time_window: timeWindow,
      service_type: serviceType,
      phase,
      ...updates,
    };
    onFilterChange(next);
  }, [date, timeWindow, serviceType, phase, onFilterChange]);

  const isDefault =
    date === todayISO() &&
    !timeWindow &&
    serviceType === "all" &&
    phase === "both";

  return (
    <div
      className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700 px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-2 sm:gap-3"
      data-testid="logistics-map-filters"
    >
      {/* Etiqueta */}
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">
        Filtros
      </span>

      {/* Fecha */}
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

      {/* Tipo de servicio */}
      <div className="flex items-center gap-1 flex-wrap">
        {SERVICE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = serviceType === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => {
                setServiceType(opt.value);
                apply({ service_type: opt.value });
              }}
              data-testid={`filter-service-${opt.value}`}
              className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1 ${
                active
                  ? "bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm dark:bg-indigo-950 dark:text-indigo-300"
                  : "bg-white dark:bg-gray-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-gray-600 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {Icon && <Icon className="w-3 h-3" />}
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Separador */}
      <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-gray-700" />

      {/* Fase: Recoger / Entregar / Ambos */}
      <div className="flex items-center gap-1">
        {PHASE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = phase === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => {
                setPhase(opt.value);
                apply({ phase: opt.value });
              }}
              data-testid={`filter-phase-${opt.value}`}
              className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1 ${
                active
                  ? opt.value === "pickup"
                    ? "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300"
                    : opt.value === "delivery"
                    ? "bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-300"
                    : "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200"
                  : "bg-white dark:bg-gray-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-gray-600 hover:border-slate-300"
              }`}
            >
              {Icon && <Icon className="w-3 h-3" />}
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Separador */}
      <div className="hidden md:block w-px h-5 bg-slate-200 dark:bg-gray-700" />

      {/* Ventana horaria */}
      <div className="flex items-center gap-1">
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

      {/* Limpiar (vuelve a defaults: hoy + ambos + todos) */}
      {!isDefault && (
        <button
          onClick={() => {
            const t = todayISO();
            setDate(t);
            setTimeWindow("");
            setServiceType("all");
            setPhase("both");
            onFilterChange({ date: t, time_window: "", service_type: "all", phase: "both" });
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
