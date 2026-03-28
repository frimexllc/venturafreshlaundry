// src/components/DeliveryZonesManager.jsx
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Circle, Polygon, FeatureGroup } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Trash2, RefreshCw, MapPin, DollarSign, X, Plus, Tabs, Tab } from "lucide-react";
import { useLocale } from "../context/LocaleContext";
import { toast } from "sonner";

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const defaultForm = {
  name: "",
  type: "polygon",
  radius_km: 10,
  rate_per_km: 1.5,
  min_fee: 4,
  max_fee: 15
};

// Coordenadas de la tienda (Ventura, CA 93001)
const STORE_COORDINATES = { lat: 34.283, lng: -119.293 };

// Mapeo de códigos postales a coordenadas
const ZIP_COORDINATES = {
  "93001": { lat: 34.283, lng: -119.293 },
  "93003": { lat: 34.254, lng: -119.215 },
  "93004": { lat: 34.302, lng: -119.186 },
  "93030": { lat: 34.187, lng: -119.179 },
  "93036": { lat: 34.237, lng: -119.181 },
  "93035": { lat: 34.174, lng: -119.222 },
  "93010": { lat: 34.225, lng: -119.082 },
};

// Calcular distancia en millas
function getDistanceInMiles(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Calcular tarifa: primeras 3 mi gratis, luego $2.99 por milla extra
function calculateDeliveryFee(distanceMiles) {
  if (distanceMiles <= 3) return 0;
  const extra = distanceMiles - 3;
  return extra * 2.99;
}

const fixLeafletIcons = () => {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
  });
};

export default function DeliveryZonesManager() {
  const { t } = useLocale();
  const [zones, setZones] = useState([]);
  const [storeCenter, setStoreCenter] = useState(null);
  const [pendingPolygon, setPendingPolygon] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("polygon"); // 'polygon' or 'postal'

  // Estado para zonas por código postal
  const [postalZones, setPostalZones] = useState(() => {
    const saved = localStorage.getItem("delivery_postal_zones");
    if (saved) return JSON.parse(saved);
    return [{
      id: "zone_1",
      name: "Ventura",
      zipCodes: ["93001", "93003", "93004", "93030", "93036", "93035", "93010"],
      ratePerMile: 2.99,
      freeMiles: 3
    }];
  });

  // Guardar postalZones en localStorage cuando cambien
  useEffect(() => {
    localStorage.setItem("delivery_postal_zones", JSON.stringify(postalZones));
  }, [postalZones]);

  // Estado para formulario de nueva zona postal
  const [newPostalZoneName, setNewPostalZoneName] = useState("");
  const [newZipInput, setNewZipInput] = useState("");
  const [newRate, setNewRate] = useState(2.99);
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [editingZipInput, setEditingZipInput] = useState("");

  // Funciones para manejar zonas por código postal
  const addPostalZone = () => {
    if (!newPostalZoneName.trim()) {
      toast.error(t("Zone name required", "Nombre de zona requerido"));
      return;
    }
    const newZone = {
      id: Date.now().toString(),
      name: newPostalZoneName,
      zipCodes: [],
      ratePerMile: parseFloat(newRate),
      freeMiles: 3
    };
    setPostalZones([...postalZones, newZone]);
    setNewPostalZoneName("");
    setNewRate(2.99);
    toast.success(t("Zone added", "Zona agregada"));
  };

  const deletePostalZone = (zoneId) => {
    setPostalZones(postalZones.filter(z => z.id !== zoneId));
    toast.info(t("Zone deleted", "Zona eliminada"));
  };

  const addZipToPostalZone = (zoneId, zip) => {
    const zipUpper = zip.trim().toUpperCase();
    if (!ZIP_COORDINATES[zipUpper]) {
      toast.error(t(`Postal code ${zipUpper} not mapped`, `CP ${zipUpper} sin coordenadas`));
      return;
    }
    const zone = postalZones.find(z => z.id === zoneId);
    if (zone.zipCodes.includes(zipUpper)) {
      toast.warning(t("Code already in zone", "Código ya existe"));
      return;
    }
    setPostalZones(postalZones.map(z =>
      z.id === zoneId ? { ...z, zipCodes: [...z.zipCodes, zipUpper] } : z
    ));
    setEditingZipInput("");
    setEditingZoneId(null);
  };

  const removeZipFromPostalZone = (zoneId, zip) => {
    setPostalZones(postalZones.map(z =>
      z.id === zoneId ? { ...z, zipCodes: z.zipCodes.filter(zc => zc !== zip) } : z
    ));
  };

  const updatePostalZoneRate = (zoneId, rate) => {
    setPostalZones(postalZones.map(z =>
      z.id === zoneId ? { ...z, ratePerMile: parseFloat(rate) } : z
    ));
  };

  // Exponer función global para calcular envío según código postal
  useEffect(() => {
    window.getDeliveryFeeByZip = (zipCode) => {
      const zone = postalZones.find(z => z.zipCodes.includes(zipCode));
      if (!zone) return { error: t("Zone not covered", "Zona no cubierta") };
      const coords = ZIP_COORDINATES[zipCode];
      if (!coords) return { error: t("Coordinates not found", "Coordenadas no encontradas") };
      const distance = getDistanceInMiles(
        STORE_COORDINATES.lat,
        STORE_COORDINATES.lng,
        coords.lat,
        coords.lng
      );
      const fee = calculateDeliveryFee(distance);
      return { distance, fee, zone: zone.name, freeMiles: zone.freeMiles, ratePerMile: zone.ratePerMile };
    };
  }, [postalZones, t]);

  // Cargar zonas geográficas (polígonos/círculos) desde el backend
  const loadZones = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/store/delivery-zones`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setZones(data.zones || []);
      setStoreCenter(data.store_center || null);
    } catch (error) {
      toast.error(t("Error loading delivery zones", "Error cargando zonas"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fixLeafletIcons();
    loadZones();
  }, []);

  // Manejadores para zonas geográficas
  const handleCreated = (e) => {
    const layer = e.layer;
    if (layer.getLatLngs) {
      const latlngs = layer.getLatLngs()[0] || [];
      const polygon = latlngs.map((pt) => [pt.lng, pt.lat]);
      setPendingPolygon(polygon);
      toast.success(t("Polygon captured. Complete zone details below.", "Polígono capturado. Completa los detalles abajo."));
    }
  };

  const handleSave = async () => {
    if (!form.name) {
      toast.error(t("Zone name is required", "Nombre de zona requerido"));
      return;
    }
    if (form.type === "polygon" && (!pendingPolygon || pendingPolygon.length < 3)) {
      toast.error(t("Draw a polygon on the map", "Dibuja un polígono en el mapa"));
      return;
    }
    if (form.type === "circle" && !storeCenter) {
      toast.error(t("Store center not available", "Centro de tienda no disponible"));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        radius_km: form.type === "circle" ? Number(form.radius_km) : null,
        center: form.type === "circle" ? storeCenter : null,
        polygon: form.type === "polygon" ? pendingPolygon : null,
        rate_per_km: Number(form.rate_per_km),
        min_fee: Number(form.min_fee),
        max_fee: Number(form.max_fee)
      };

      const res = await fetch(`${API_URL}/store/delivery-zones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || "Failed");
      }
      toast.success(t("Zone saved", "Zona guardada"));
      setForm(defaultForm);
      setPendingPolygon(null);
      await loadZones();
    } catch (error) {
      toast.error(error.message || t("Error saving zone", "Error guardando zona"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (zoneId) => {
    try {
      const res = await fetch(`${API_URL}/store/delivery-zones/${zoneId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success(t("Zone deleted", "Zona eliminada"));
      await loadZones();
    } catch (error) {
      toast.error(t("Unable to delete zone", "No se pudo eliminar"));
    }
  };

  const renderZoneShape = (zone) => {
    if (zone.type === "circle" && zone.center && zone.radius_km) {
      return (
        <Circle
          key={zone.id}
          center={[zone.center[1], zone.center[0]]}
          radius={zone.radius_km * 1000}
          pathOptions={{ color: "#0ea5e9" }}
        />
      );
    }
    if (zone.type === "polygon" && zone.polygon) {
      const positions = zone.polygon.map((coord) => [coord[1], coord[0]]);
      return <Polygon key={zone.id} positions={positions} pathOptions={{ color: "#f97316" }} />;
    }
    return null;
  };

  const mapCenter = useMemo(() => {
    if (!storeCenter) return [34.2746, -119.2290];
    return [storeCenter[1], storeCenter[0]];
  }, [storeCenter]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6" data-testid="delivery-zones-panel">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{t("Delivery Zones", "Zonas de entrega")}</h2>
          <p className="text-sm text-slate-500">
            {t("Manage coverage, tariffs and polygons for deliveries.", "Gestiona cobertura, tarifas y polígonos.")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadZones(); }} data-testid="delivery-zones-refresh">
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("Refresh", "Actualizar")}
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-4">
          <button
            onClick={() => setActiveTab("polygon")}
            className={`py-2 px-3 text-sm font-medium transition-colors ${
              activeTab === "polygon"
                ? "border-b-2 border-sky-600 text-sky-700"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t("Zones by polygon", "Zonas por polígono")}
          </button>
          <button
            onClick={() => setActiveTab("postal")}
            className={`py-2 px-3 text-sm font-medium transition-colors ${
              activeTab === "postal"
                ? "border-b-2 border-sky-600 text-sky-700"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t("Zones by postal code", "Zonas por código postal")}
          </button>
        </nav>
      </div>

      {/* TAB 1: Polígonos (funcionalidad existente) */}
      {activeTab === "polygon" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="h-[420px] w-full rounded-xl overflow-hidden border border-slate-200" data-testid="delivery-zones-map">
                <MapContainer center={mapCenter} zoom={12} style={{ height: "100%", width: "100%" }}>
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap contributors"
                  />
                  {zones.map(renderZoneShape)}
                  <FeatureGroup>
                    <EditControl
                      position="topright"
                      onCreated={handleCreated}
                      draw={{
                        polygon: true,
                        rectangle: false,
                        polyline: false,
                        circle: false,
                        marker: false,
                        circlemarker: false
                      }}
                    />
                  </FeatureGroup>
                </MapContainer>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {t("Draw polygons on the map to create custom delivery zones.", "Dibuja polígonos en el mapa para crear zonas personalizadas.")}
              </p>
            </div>

            <div className="space-y-4" data-testid="delivery-zones-form">
              <div className="space-y-2">
                <Label>{t("Zone name", "Nombre de zona")}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t("Downtown", "Centro")}
                  data-testid="delivery-zone-name"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Zone type", "Tipo de zona")}</Label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  data-testid="delivery-zone-type"
                >
                  <option value="polygon">{t("Polygon", "Polígono")}</option>
                  <option value="circle">{t("Circle (radius)", "Círculo (radio)")}</option>
                </select>
              </div>
              {form.type === "circle" && (
                <div className="space-y-2">
                  <Label>{t("Radius (km)", "Radio (km)")}</Label>
                  <Input
                    type="number"
                    value={form.radius_km}
                    onChange={(e) => setForm({ ...form, radius_km: e.target.value })}
                    data-testid="delivery-zone-radius"
                  />
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label>{t("Rate/km", "Tarifa/km")}</Label>
                  <Input
                    type="number"
                    value={form.rate_per_km}
                    onChange={(e) => setForm({ ...form, rate_per_km: e.target.value })}
                    data-testid="delivery-zone-rate"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("Min fee", "Mínimo")}</Label>
                  <Input
                    type="number"
                    value={form.min_fee}
                    onChange={(e) => setForm({ ...form, min_fee: e.target.value })}
                    data-testid="delivery-zone-min"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("Max fee", "Máximo")}</Label>
                  <Input
                    type="number"
                    value={form.max_fee}
                    onChange={(e) => setForm({ ...form, max_fee: e.target.value })}
                    data-testid="delivery-zone-max"
                  />
                </div>
              </div>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-sky-600 hover:bg-sky-700"
                data-testid="delivery-zone-save"
              >
                {saving ? t("Saving...", "Guardando...") : t("Save zone", "Guardar zona")}
              </Button>
            </div>
          </div>

          <div className="space-y-3" data-testid="delivery-zones-list">
            {zones.length === 0 ? (
              <p className="text-sm text-slate-500" data-testid="delivery-zones-empty">
                {t("No zones available", "Sin zonas")}
              </p>
            ) : (
              zones.map((zone) => (
                <div key={zone.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900" data-testid={`delivery-zone-name-${zone.id}`}>
                      {zone.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {zone.type === "circle"
                        ? t("Circle", "Círculo")
                        : t("Polygon", "Polígono")} - {zone.rate_per_km}/km
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(zone.id)}
                    data-testid={`delivery-zone-delete-${zone.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* TAB 2: Zonas por código postal */}
      {activeTab === "postal" && (
        <div className="space-y-6">
          <p className="text-sm text-slate-500">
            {t("Define zones by postal code. Shipping cost: first 3 miles free, then $2.99 per extra mile.", "Define zonas por código postal. Costo de envío: primeras 3 millas gratis, luego $2.99 por milla extra.")}
          </p>

          {/* Lista de zonas existentes */}
          {postalZones.map(zone => (
            <div key={zone.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50/30">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-500" />
                    <span className="font-semibold text-slate-800">{zone.name}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-slate-400" />
                      <Input
                        type="number"
                        step="0.01"
                        value={zone.ratePerMile}
                        onChange={(e) => updatePostalZoneRate(zone.id, e.target.value)}
                        className="w-20 h-7 text-sm"
                      />
                      <span className="text-xs text-slate-500">/milla extra</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deletePostalZone(zone.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {t("Delete zone", "Eliminar zona")}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Códigos postales de la zona */}
              <div className="mt-2">
                <Label className="text-xs text-slate-500">{t("Postal codes", "Códigos postales")}</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {zone.zipCodes.map(zip => (
                    <span
                      key={zip}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-sky-100 text-sky-800 text-xs rounded-full"
                    >
                      {zip}
                      <button
                        onClick={() => removeZipFromPostalZone(zone.id, zip)}
                        className="hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <div className="flex items-center gap-1">
                    <Input
                      value={editingZoneId === zone.id ? editingZipInput : ""}
                      onChange={(e) => {
                        setEditingZoneId(zone.id);
                        setEditingZipInput(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          addZipToPostalZone(zone.id, editingZipInput);
                        }
                      }}
                      placeholder={t("Add ZIP", "Agregar CP")}
                      className="w-24 h-7 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addZipToPostalZone(zone.id, editingZipInput)}
                      className="h-7 px-2"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Formulario para nueva zona postal */}
          <div className="border border-dashed border-slate-300 rounded-lg p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <Label className="text-xs">{t("Zone name", "Nombre zona")}</Label>
                <Input
                  value={newPostalZoneName}
                  onChange={(e) => setNewPostalZoneName(e.target.value)}
                  placeholder={t("e.g., Ventura North", "Ej: Ventura Norte")}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">{t("Rate per extra mile ($)", "Tarifa por milla extra ($)")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Button onClick={addPostalZone} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("Add zone", "Agregar zona")}
                </Button>
              </div>
            </div>
          </div>

          {/* Ejemplo de cálculo */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="font-medium text-slate-700 mb-2">{t("Distance & fee example", "Ejemplo de distancia y tarifa")}</h4>
            <p className="text-sm text-slate-500">
              {t("For any postal code in the zone, distance is calculated from the store (Ventura, CA 93001). First 3 miles free, then $2.99 per extra mile.", "Para cualquier código postal en la zona, la distancia se calcula desde la tienda (Ventura, CA 93001). Primeras 3 millas gratis, luego $2.99 por milla extra.")}
            </p>
            <div className="mt-2 text-xs text-slate-400">
              {t("Store coordinates", "Coordenadas tienda")}: {STORE_COORDINATES.lat}, {STORE_COORDINATES.lng}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="text-sm text-slate-500" data-testid="delivery-zones-loading">
          {t("Loading zones...", "Cargando zonas...")}
        </div>
      )}
    </div>
  );
}