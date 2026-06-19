// src/components/logistics/VehicleSelectorModal.jsx
// Modal pre-navegación: pide al driver vehículo + nombre antes de arrancar
// la ruta. Persiste la selección en localStorage para no preguntar de nuevo
// en la misma jornada.

import { useState, useEffect } from "react";
import { Truck, X, User, Fuel, Gauge } from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const STORAGE_KEY = "vfl_driver_vehicle";

// Vehículos por defecto si la DB está vacía (para que el operador no se quede colgado)
const DEFAULT_VEHICLES = [
  { id: "default-sienna", name: "Toyota Sienna", mpg: 22, plate: "—" },
  { id: "default-transit", name: "Ford Transit Van", mpg: 16, plate: "—" },
  { id: "default-sedan", name: "Sedán económico", mpg: 30, plate: "—" },
];

function VehicleSelectorModal({ open, onClose, onConfirm }) {
  const [vehicles, setVehicles] = useState(DEFAULT_VEHICLES);
  const [selectedId, setSelectedId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [customMpg, setCustomMpg] = useState("");
  const [loading, setLoading] = useState(false);

  // Cargar vehículos del backend + restaurar preferencia
  useEffect(() => {
    if (!open) return;

    // Restaurar última selección
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved.driverName) setDriverName(saved.driverName);
      if (saved.selectedId) setSelectedId(saved.selectedId);
      if (saved.customMpg) setCustomMpg(String(saved.customMpg));
    } catch {/* ignore */}

    // Cargar vehículos reales
    const token = localStorage.getItem("token");
    if (!token) return;
    setLoading(true);
    fetch(`${API_URL}/api/finances/vehicles`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        const normalized = list
          .filter(v => v?.name)
          .map(v => ({
            id: v.id || v._id || v.name,
            name: v.name,
            mpg: Number(v.mpg ?? v.fuel_mpg ?? v.avg_mpg ?? 22),
            plate: v.plate || v.license_plate || "—",
          }));
        if (normalized.length) setVehicles(normalized);
      })
      .catch(() => {/* fallback a DEFAULT_VEHICLES */})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const selected = vehicles.find(v => v.id === selectedId) || vehicles[0];
  const effectiveMpg = Number(customMpg) > 0 ? Number(customMpg) : (selected?.mpg || 22);

  const handleConfirm = () => {
    if (!selected || !driverName.trim()) return;
    const payload = {
      vehicle_id: selected.id,
      vehicle_name: selected.name,
      driver_name: driverName.trim(),
      mpg: effectiveMpg,
    };
    // Persistir para próximos viajes
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedId: selected.id,
      driverName: driverName.trim(),
      customMpg: customMpg || "",
    })); } catch {/* ignore */}
    onConfirm(payload);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      data-testid="vehicle-selector-modal"
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-5 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-xl transition"
            data-testid="vehicle-modal-close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-2xl">
              <Truck className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Antes de empezar la ruta</h2>
              <p className="text-xs text-blue-100 mt-1">
                Confirma vehículo y conductor para registrar consumo
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Driver */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
              <User className="w-3.5 h-3.5" /> Nombre del conductor
            </label>
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="Ej: Alejandro Pérez"
              autoFocus
              data-testid="vehicle-modal-driver"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
          </div>

          {/* Vehicle picker */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
              <Truck className="w-3.5 h-3.5" /> Vehículo {loading && <span className="text-gray-400 normal-case font-normal">(cargando…)</span>}
            </label>
            <div className="space-y-3">
              {vehicles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  data-testid={`vehicle-option-${v.id}`}
                  className={`w-full text-left flex items-center justify-between px-4 py-3 rounded-2xl border transition-all shadow-sm ${
                    selectedId === v.id
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-md"
                      : "border-gray-200 hover:border-blue-300 hover:bg-gray-50 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                      selectedId === v.id ? "bg-blue-100" : "bg-gray-100"
                    }`}>
                      🚐
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900">{v.name}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">Placa: {v.plate} · {v.mpg} mpg</div>
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    selectedId === v.id ? "border-blue-500 bg-blue-500" : "border-gray-300"
                  }`}>
                    {selectedId === v.id && <span className="w-2.5 h-2.5 bg-white rounded-full" />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom mpg (advanced) */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
              <Gauge className="w-3.5 h-3.5" /> Rendimiento real (mpg) <span className="text-gray-400 normal-case font-normal">— opcional</span>
            </label>
            <input
              type="number"
              step="0.1"
              min="5"
              max="80"
              value={customMpg}
              onChange={(e) => setCustomMpg(e.target.value)}
              placeholder={`Por defecto: ${selected?.mpg || 22} mpg`}
              data-testid="vehicle-modal-mpg"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
            <p className="text-[10px] text-gray-500 mt-1 leading-tight">
              Si dejas vacío usamos el rendimiento de fábrica del vehículo. Ajusta para reflejar consumo real.
            </p>
          </div>

          {/* Preview */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
            <Fuel className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-xs leading-tight">
              <div className="font-semibold text-emerald-800">Se registrará automáticamente:</div>
              <div className="text-emerald-700">
                Millas, galones, costo total ({effectiveMpg} mpg) y gasto en finanzas al terminar la ruta.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            data-testid="vehicle-modal-cancel"
            className="flex-1 py-3 rounded-2xl text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!driverName.trim() || !selected}
            data-testid="vehicle-modal-confirm"
            className="flex-[2] py-3 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-lg"
          >
            Empezar ruta →
          </button>
        </div>
      </div>
    </div>
  );
}

export default VehicleSelectorModal;
