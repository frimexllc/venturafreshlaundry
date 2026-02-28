import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Circle, Polygon, FeatureGroup } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Trash2, RefreshCw } from "lucide-react";
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

  const mapCenter = useMemo(() => {
    if (!storeCenter) return [34.2746, -119.2290];
    return [storeCenter[1], storeCenter[0]];
  }, [storeCenter]);

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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6" data-testid="delivery-zones-panel">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{t("Delivery Zones", "Zonas de entrega")}</h2>
          <p className="text-sm text-slate-500">
            {t("Manage coverage, tariffs and polygons for deliveries.", "Gestiona cobertura, tarifas y polígonos.")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadZones} data-testid="delivery-zones-refresh">
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("Refresh", "Actualizar")}
        </Button>
      </div>

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

      {loading && (
        <div className="text-sm text-slate-500" data-testid="delivery-zones-loading">
          {t("Loading zones...", "Cargando zonas...")}
        </div>
      )}
    </div>
  );
}
