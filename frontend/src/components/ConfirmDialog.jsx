import { Dialog, DialogContent } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { CheckCircle } from "lucide-react";

export default function ConfirmDialog({ open, title, description, onConfirm, onCancel }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="w-[95vw] max-w-sm bg-white">
        <div className="flex items-start gap-3 mb-5">
          <div className="h-10 w-10 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
            <CheckCircle className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{title}</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button size="sm" className="bg-sky-600 hover:bg-sky-700" onClick={onConfirm}>Confirmar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}