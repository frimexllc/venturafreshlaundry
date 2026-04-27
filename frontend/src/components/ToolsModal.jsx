import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const TOOL_SIZES = {
  sm:  "max-w-sm",
  md:  "max-w-md",
  lg:  "max-w-lg",
  xl:  "max-w-2xl",
  "2xl": "max-w-3xl",
};

export default function ToolsModal({
  open,
  onClose,
  title,
  icon: Icon,
  size = "md",
  children,
  accentColor = "sky",
}) {
  const overlayRef = useRef(null);
  const panelRef   = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Trap body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const accentMap = {
    sky:    { ring: "ring-sky-200",    headerBg: "from-sky-500 to-sky-600",    iconBg: "bg-sky-100 text-sky-600" },
    violet: { ring: "ring-violet-200", headerBg: "from-violet-500 to-violet-600", iconBg: "bg-violet-100 text-violet-600" },
    emerald:{ ring: "ring-emerald-200",headerBg: "from-emerald-500 to-emerald-600", iconBg: "bg-emerald-100 text-emerald-600" },
    amber:  { ring: "ring-amber-200",  headerBg: "from-amber-500 to-amber-600",  iconBg: "bg-amber-100 text-amber-600" },
    rose:   { ring: "ring-rose-200",   headerBg: "from-rose-500 to-rose-600",    iconBg: "bg-rose-100 text-rose-600" },
    slate:  { ring: "ring-slate-200",  headerBg: "from-slate-600 to-slate-700",  iconBg: "bg-slate-100 text-slate-600" },
  };
  const accent = accentMap[accentColor] || accentMap.sky;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}
    >
      <div
        ref={panelRef}
        className={`
          relative w-full ${TOOL_SIZES[size]} bg-white rounded-2xl shadow-2xl
          ring-1 ${accent.ring}
          flex flex-col overflow-hidden
          animate-modal-in
        `}
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className={`bg-gradient-to-r ${accent.headerBg} px-5 py-4 flex items-center gap-3 flex-shrink-0`}>
          {Icon && (
            <div className="bg-white/20 rounded-xl p-2 flex items-center justify-center">
              <Icon className="h-5 w-5 text-white" />
            </div>
          )}
          <h2 className="text-white font-bold text-base tracking-tight flex-1">{title}</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        .animate-modal-in { animation: modal-in 0.18s cubic-bezier(0.34,1.56,0.64,1) both; }
      `}</style>
    </div>
  );
}