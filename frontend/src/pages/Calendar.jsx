import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Calendar } from "../components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin, User, Truck } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO, isValid } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  new: "bg-amber-500",
  processing: "bg-sky-500",
  ready: "bg-indigo-500",
  out_for_delivery: "bg-purple-500",
  delivered: "bg-emerald-500",
  completed: "bg-emerald-600",
  cancelled: "bg-slate-400"
};

const serviceTypeLabels = {
  pickup_delivery: "Pickup & Delivery",
  wash_fold: "Wash & Fold",
  self_service: "Self Service"
};

export default function CalendarPage() {
  const { locale, t } = useLocale();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [dayEvents, setDayEvents] = useState([]);

  // Define status labels with translation
  const statusLabels = {
    new: t("New", "Nueva"),
    processing: t("Processing", "Procesando"),
    ready: t("Ready", "Lista"),
    out_for_delivery: t("Out for delivery", "En camino"),
    delivered: t("Delivered", "Entregada"),
    completed: t("Completed", "Completada"),
    cancelled: t("Cancelled", "Cancelada")
  };

  // Choose date-fns locale based on current language
  const dateFnsLocale = locale === "es" ? es : enUS;

  useEffect(() => {
    fetchEvents();
  }, [currentMonth]);

  const fetchEvents = async () => {
    try {
      const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
      const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");
      
      const res = await axios.get(`${API}/calendar/orders`, {
        params: { start_date: start, end_date: end }
      });
      setEvents(res.data);
    } catch (error) {
      console.error("Error loading calendar events:", error);
    } finally {
      setLoading(false);
    }
  };

  const getEventsForDate = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return events.filter(e => e.date === dateStr);
  };

  const handleDateSelect = (date) => {
    if (!date) return;
    setSelectedDate(date);
    setDayEvents(getEventsForDate(date));
  };

  const handlePrevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handleToday = () => {
    setCurrentMonth(new Date());
    handleDateSelect(new Date());
  };

  // Custom day content to show event dots
  const renderDay = (day) => {
    const dateEvents = getEventsForDate(day);
    return (
      <div className="relative w-full h-full flex flex-col items-center">
        <span>{format(day, "d")}</span>
        {dateEvents.length > 0 && (
          <div className="flex gap-0.5 mt-1">
            {dateEvents.slice(0, 3).map((event, idx) => (
              <div
                key={idx}
                className={`h-1.5 w-1.5 rounded-full ${statusColors[event.status] || "bg-slate-400"}`}
              />
            ))}
            {dateEvents.length > 3 && (
              <span className="text-[8px] text-slate-400">+{dateEvents.length - 3}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  // Format date for the side panel (e.g., "March 15, 2025" or "15 de marzo, 2025")
  const formatSelectedDate = (date) => {
    if (!date) return "";
    if (locale === "es") {
      return format(date, "d 'de' MMMM, yyyy", { locale: dateFnsLocale });
    } else {
      return format(date, "MMMM d, yyyy", { locale: dateFnsLocale });
    }
  };

  return (
    <div data-testid="calendar-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("Calendar", "Calendario")}</h1>
          <p className="text-slate-500 mt-1">
            {t("Pickups and deliveries schedule view", "Vista de pickups y entregas programadas")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleToday}>
            {t("Today", "Hoy")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Status Legend */}
      <div className="flex flex-wrap gap-4 p-4 bg-white rounded-xl border border-slate-200">
        {Object.entries(statusLabels).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${statusColors[key]}`} />
            <span className="text-sm text-slate-600">{label}</span>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-center mb-4">
            <h2 className="text-xl font-semibold text-slate-900 capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: dateFnsLocale })}
            </h2>
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
            </div>
          ) : (
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              className="rounded-md border-0 w-full"
              classNames={{
                months: "w-full",
                month: "w-full",
                table: "w-full",
                head_row: "w-full flex",
                head_cell: "flex-1 text-slate-500 font-medium text-sm py-2",
                row: "w-full flex mt-1",
                cell: "flex-1 text-center p-0",
                day: "w-full h-12 sm:h-16 p-1 font-normal text-sm hover:bg-sky-50 rounded-lg transition-colors cursor-pointer",
                day_selected: "bg-sky-100 text-sky-900 hover:bg-sky-100",
                day_today: "bg-slate-100 text-slate-900",
                day_outside: "text-slate-300"
              }}
              components={{
                DayContent: ({ date }) => renderDay(date)
              }}
            />
          )}
        </div>

        {/* Day Events Panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="h-5 w-5 text-sky-600" />
            <h3 className="font-semibold text-slate-900">
              {selectedDate ? formatSelectedDate(selectedDate) : t("Select a date", "Selecciona una fecha")}
            </h3>
          </div>

          {selectedDate ? (
            dayEvents.length > 0 ? (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {dayEvents.map((event) => (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className="p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                    data-testid={`calendar-event-${event.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 text-sm truncate">
                          {event.order_number}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{event.customer_name}</p>
                      </div>
                      <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${statusColors[event.status]}`} />
                    </div>
                    {event.time && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        <span>{event.time}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <CalendarDays className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p>{t("No pickups scheduled", "No hay pickups programados")}</p>
              </div>
            )
          ) : (
            <div className="text-center py-8 text-slate-500">
              <p>{t("Click on a date to see pickups", "Haz clic en una fecha para ver los pickups")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Event Detail Dialog */}
     <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="bg-white"> {/* <-- forzar fondo blanco */}
          <DialogHeader>
            <DialogTitle>{t("Order", "Orden")} {selectedEvent?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${statusColors[selectedEvent.status]}`} />
                <span className="font-medium">{statusLabels[selectedEvent.status]}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <User className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">{t("Customer", "Cliente")}</p>
                    <p className="font-medium text-sm">{selectedEvent.customer_name}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <Truck className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">{t("Service", "Servicio")}</p>
                    <p className="font-medium text-sm">{serviceTypeLabels[selectedEvent.service_type]}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-2">
                <CalendarDays className="h-4 w-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500">{t("Date and Time", "Fecha y Hora")}</p>
                  <p className="font-medium text-sm">
                    {selectedEvent.date} {selectedEvent.time && `• ${selectedEvent.time}`}
                  </p>
                </div>
              </div>
              
              {selectedEvent.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">{t("Address", "Dirección")}</p>
                    <p className="font-medium text-sm">{selectedEvent.address}</p>
                  </div>
                </div>
              )}
              
              <div className="pt-4 border-t">
                <Button 
                  className="w-full btn-primary"
                  onClick={() => window.location.href = `/admin/orders`}
                >
                  {t("View Full Order", "Ver Orden Completa")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}