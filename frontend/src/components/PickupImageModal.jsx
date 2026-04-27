import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Camera, Upload, X, CheckCircle, AlertTriangle, Package } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "../context/LocaleContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * PickupImageModal — la foto es OBLIGATORIA para avanzar el estado.
 *
 * Props:
 *  - open: boolean
 *  - order: { order_id, order_number, customer_name }
 *  - pendingStatus: "picked_up" | "delivered"
 *  - onClose(): void — cancela la acción, el estado NO cambia
 *  - onConfirm(imageResult): void — solo se llama tras subir la foto exitosamente
 */
export default function PickupImageModal({ open, order, pendingStatus, onClose, onConfirm }) {
  const { t } = useLocale();
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const isDelivery = pendingStatus?.toLowerCase() === "delivered";
  const ActionIcon = isDelivery ? Package : Camera;

  const reset = useCallback(() => {
    setPreview(null);
    setFile(null);
    setUploading(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowed.includes(selected.type)) {
      toast.error(
        t("Only JPG, PNG or WebP images are allowed", "Solo se permiten imágenes JPG, PNG o WebP")
      );
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error(t("Image too large (max 10MB)", "Imagen demasiado grande (máx 10MB)"));
      return;
    }
    setFile(selected);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(selected);
    e.target.value = "";
  };

  const handleConfirm = async () => {
    // Foto obligatoria — no se puede confirmar sin ella
    if (!file) {
      toast.error(
        isDelivery
          ? t(
              "A delivery photo is required to continue",
              "Se requiere una foto de entrega para continuar"
            )
          : t(
              "A pickup photo is required to continue",
              "Se requiere una foto de recolección para continuar"
            )
      );
      return;
    }

    setUploading(true);
    try {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token");
      const formData = new FormData();
      formData.append("file", file);

      // El backend guarda la imagen Y dispara la notificación al cliente
      const endpoint = isDelivery
        ? `${API_URL}/api/driver/orders/${order?.order_id}/delivery-image`
        : `${API_URL}/api/driver/orders/${order?.order_id}/pickup-image`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || t("Error uploading image", "Error subiendo imagen"));
      }

      const data = await res.json();
      toast.success(
        isDelivery
          ? t(
              "Delivery photo saved — customer notified",
              "Foto de entrega guardada — cliente notificado"
            )
          : t(
              "Pickup photo saved — customer notified",
              "Foto de recolección guardada — cliente notificado"
            )
      );
      onConfirm(data);
      reset();
    } catch (err) {
      toast.error(err.message || t("Error uploading image", "Error subiendo la imagen"));
    } finally {
      setUploading(false);
    }
  };

  if (!order) return null;

  const titleText = isDelivery
    ? t("Delivery photo (required)", "Foto de entrega (obligatoria)")
    : t("Pickup photo (required)", "Foto de recolección (obligatoria)");

  const instructionText = isDelivery
    ? t(
        "A photo is required to mark this order as delivered. The customer will be notified automatically.",
        "Se requiere una foto para marcar la orden como entregada. El cliente será notificado automáticamente."
      )
    : t(
        "A photo is required to mark this order as picked up. The customer will be notified automatically.",
        "Se requiere una foto para marcar la orden como recolectada. El cliente será notificado automáticamente."
      );

  const confirmText = isDelivery
    ? t("Confirm delivery", "Confirmar entrega")
    : t("Confirm pickup", "Confirmar recolección");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="w-[95vw] max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <ActionIcon className="h-4 w-4 text-sky-600" />
            {titleText}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("Order", "Orden")}{" "}
            <span className="font-mono font-semibold">{order.order_number}</span>
            {" "}— {order.customer_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Aviso obligatorio */}
          <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-sky-600 mt-0.5 shrink-0" />
            <p className="text-xs text-sky-700 leading-relaxed font-medium">
              {instructionText}
            </p>
          </div>

          {/* Preview / Drop zone */}
          {preview ? (
            <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
              <img
                src={preview}
                alt={t("Preview", "Vista previa")}
                className="w-full max-h-64 object-contain"
              />
              <button
                className="absolute top-2 right-2 bg-white/80 hover:bg-white rounded-full p-1 border border-slate-200"
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                }}
                title={t("Remove photo", "Quitar foto")}
              >
                <X className="h-3.5 w-3.5 text-slate-600" />
              </button>
              <div className="absolute bottom-2 left-2 bg-emerald-500/90 text-white text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                {t("Photo ready", "Foto lista")}
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-sky-200 rounded-xl p-8 text-center cursor-pointer hover:border-sky-400 hover:bg-sky-50/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-sky-400 mx-auto mb-2" />
              <p className="text-sm text-slate-600 font-medium">
                {t("Select or drag a photo", "Selecciona o arrastra una foto")}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {t("JPG, PNG, WebP · max 10MB", "JPG, PNG, WebP · máx 10MB")}
              </p>
            </div>
          )}

          {/* Botones de selección */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs border-sky-200 text-sky-700 hover:bg-sky-50"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
            >
              <Camera className="h-4 w-4" />
              {t("Take photo", "Tomar foto")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4" />
              {t("Gallery / File", "Galería / archivo")}
            </Button>
          </div>

          {/* Inputs ocultos */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Acciones — SIN botón omitir */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-slate-500"
              onClick={handleClose}
              disabled={uploading}
            >
              {t("Cancel", "Cancelar")}
            </Button>
            <Button
              size="sm"
              className="flex-1 text-xs gap-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleConfirm}
              disabled={uploading || !file}
            >
              {uploading ? (
                t("Uploading…", "Subiendo…")
              ) : (
                <>
                  <CheckCircle className="h-3.5 w-3.5" />
                  {confirmText}
                </>
              )}
            </Button>
          </div>

          {/* Mensaje de ayuda cuando no hay foto */}
          {!file && (
            <p className="text-center text-xs text-slate-400">
              {t(
                "The status will not change until a photo is uploaded",
                "El estado no cambiará hasta que se cargue una foto"
              )}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}