import { useState } from "react";
import { Calendar, Sun, Moon, X, Filter } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useLocale } from "../context/LocaleContext";

export default function MapFilters({ onFilterChange, activeFilters }) {
  const { t } = useLocale();
  const [date, setDate] = useState(activeFilters?.date || "");
  const [timeWindow, setTimeWindow] = useState(activeFilters?.time_window || "");

  const applyFilters = (newDate, newTW) => {
    setDate(newDate);
    setTimeWindow(newTW);
    onFilterChange({ date: newDate || undefined, time_window: newTW || undefined });
  };

  const clearFilters = () => {
    setDate("");
    setTimeWindow("");
    onFilterChange({});
  };

  const hasFilters = date || timeWindow;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 bg-white border-b border-slate-100" data-testid="map-filters">
      <Filter className="h-4 w-4 text-slate-400 shrink-0" />
      <div className="flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-slate-400" />
        <Input
          type="date"
          value={date}
          onChange={(e) => applyFilters(e.target.value, timeWindow)}
          className="h-8 w-[150px] text-xs"
          data-testid="map-filter-date"
        />
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant={timeWindow === "morning" ? "default" : "outline"}
          className={`h-8 text-xs gap-1.5 ${timeWindow === "morning" ? "bg-amber-500 hover:bg-amber-600 text-white" : "hover:border-amber-300 hover:text-amber-600"}`}
          onClick={() => applyFilters(date, timeWindow === "morning" ? "" : "morning")}
          data-testid="map-filter-morning"
        >
          <Sun className="h-3.5 w-3.5" />
          {t("Morning", "Manana")} (8-12)
        </Button>
        <Button
          size="sm"
          variant={timeWindow === "afternoon" ? "default" : "outline"}
          className={`h-8 text-xs gap-1.5 ${timeWindow === "afternoon" ? "bg-indigo-500 hover:bg-indigo-600 text-white" : "hover:border-indigo-300 hover:text-indigo-600"}`}
          onClick={() => applyFilters(date, timeWindow === "afternoon" ? "" : "afternoon")}
          data-testid="map-filter-afternoon"
        >
          <Moon className="h-3.5 w-3.5" />
          {t("Afternoon", "Tarde")} (14-18)
        </Button>
      </div>
      {hasFilters && (
        <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-400 hover:text-red-500 gap-1" onClick={clearFilters} data-testid="map-filter-clear">
          <X className="h-3.5 w-3.5" />
          {t("Clear", "Limpiar")}
        </Button>
      )}
    </div>
  );
}
