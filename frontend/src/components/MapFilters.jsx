import { useState } from "react";
import { Calendar, Sun, Moon, X, Filter } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useLocale } from "../context/LocaleContext";

// ── Inline MapFilters replacement (safe, no external dependency) ──────────
function MapFilters({ onFilterChange, activeFilters = {} }) {
  const [date, setDate] = useState(activeFilters.date || '');
  const [timeWindow, setTimeWindow] = useState(activeFilters.time_window || '');

  function apply(newDate, newWindow) {
    onFilterChange({ date: newDate, time_window: newWindow });
  }

  return (
    <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-700 px-3 py-2 flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
        <Filter className="w-3 h-3" /> Filtros
      </span>
      <div className="flex items-center gap-1">
        <Calendar className="w-3.5 h-3.5 text-gray-400" />
        <input
          type="date"
          value={date}
          onChange={e => { setDate(e.target.value); apply(e.target.value, timeWindow); }}
          className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      <div className="flex gap-1">
        {[
          { label: 'Mañana', value: 'morning' },
          { label: 'Tarde', value: 'afternoon' },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => {
              const next = timeWindow === opt.value ? '' : opt.value;
              setTimeWindow(next);
              apply(date, next);
            }}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
              timeWindow === opt.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-blue-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
        {(date || timeWindow) && (
          <button
            onClick={() => { setDate(''); setTimeWindow(''); apply('', ''); }}
            className="text-[10px] text-gray-400 hover:text-red-500 px-1.5"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export default MapFilters;