import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { CheckCircle, Clock, TrendingDown, Star, History } from 'lucide-react';

export function EndOfDayModal({ open, onClose, routeResult, completedCount, trafficDelay, startTime }) {
  if (!routeResult) return null;
  const totalStops = routeResult.stops.length;
  const pct = totalStops > 0 ? Math.round((completedCount / totalStops) * 100) : 0;
  const elapsedMs = Date.now() - startTime;
  const elapsedMin = Math.round(elapsedMs / 60000);
  const hh = Math.floor(elapsedMin / 60);
  const mm = elapsedMin % 60;
  const elapsedLabel = hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
  const estMin = routeResult.estimatedDuration + trafficDelay;
  const diffMin = elapsedMin - estMin;
  const faster = diffMin < -3;
  const slower = diffMin > 5;
  const stars = completedCount === totalStops ? 3 : completedCount >= Math.ceil(totalStops * 0.7) ? 2 : 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm mx-4" data-testid="end-of-day-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <CheckCircle className="w-6 h-6 text-green-500" />
            Resumen de Ruta
          </DialogTitle>
        </DialogHeader>
        <div className="flex justify-center gap-1 py-2">
          {[1, 2, 3].map((s) => (
            <Star key={s} className={`w-8 h-8 transition-all ${s <= stars ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 rounded-xl border border-green-100 px-4 py-3 text-center">
            <div className="text-2xl font-black text-green-700">{completedCount}/{totalStops}</div>
            <div className="text-[10px] text-green-600 font-semibold uppercase mt-0.5">Paradas completadas</div>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-100 px-4 py-3 text-center">
            <div className="text-2xl font-black text-blue-700">{routeResult.totalDistance} mi</div>
            <div className="text-[10px] text-blue-600 font-semibold uppercase mt-0.5">Distancia recorrida</div>
          </div>
          <div className={`rounded-xl border px-4 py-3 text-center ${faster ? 'bg-emerald-50 border-emerald-100' : slower ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
            <div className={`text-2xl font-black ${faster ? 'text-emerald-700' : slower ? 'text-amber-700' : 'text-slate-700'}`}>{elapsedLabel}</div>
            <div className={`text-[10px] font-semibold uppercase mt-0.5 ${faster ? 'text-emerald-600' : slower ? 'text-amber-600' : 'text-slate-500'}`}>Tiempo real</div>
          </div>
          <div className="bg-orange-50 rounded-xl border border-orange-100 px-4 py-3 text-center">
            <div className="text-2xl font-black text-orange-700">${routeResult.estimatedFuelCost}</div>
            <div className="text-[10px] text-orange-600 font-semibold uppercase mt-0.5">Gasolina est.</div>
          </div>
        </div>
        {routeResult.savedMiles > 0 && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
            <TrendingDown className="w-4 h-4 text-green-600 shrink-0" />
            <div className="text-sm text-green-800"><strong>{routeResult.savedMiles.toFixed(1)} mi ahorradas</strong> vs ruta simple</div>
          </div>
        )}
        {Math.abs(diffMin) > 3 && (
          <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 border ${faster ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <Clock className={`w-4 h-4 shrink-0 ${faster ? 'text-emerald-600' : 'text-amber-600'}`} />
            <div className={`text-sm ${faster ? 'text-emerald-800' : 'text-amber-800'}`}>
              {faster ? <><strong>{Math.abs(diffMin)} min antes</strong> de lo estimado</> : <><strong>{diffMin} min de retraso</strong> vs estimado</>}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 text-[10px] text-gray-400 justify-center pt-1">
          <History className="w-3 h-3" /> Guardado en historial de rutas
        </div>
        <button onClick={onClose} data-testid="end-of-day-close-btn" className="w-full mt-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2">
          <CheckCircle className="w-4 h-4" /> Excelente trabajo!
        </button>
      </DialogContent>
    </Dialog>
  );
}
