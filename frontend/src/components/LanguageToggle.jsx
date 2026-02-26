import { useLocale } from "../context/LocaleContext";

export default function LanguageToggle({ className = "", buttonClassName = "" }) {
  const { locale, setLocale } = useLocale();

  return (
    <div className={`inline-flex items-center gap-2 ${className}`} data-testid="language-toggle">
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
          locale === "en"
            ? "bg-slate-900 text-white border-slate-900"
            : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
        } ${buttonClassName}`}
        data-testid="language-toggle-en"
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("es")}
        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
          locale === "es"
            ? "bg-slate-900 text-white border-slate-900"
            : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"
        } ${buttonClassName}`}
        data-testid="language-toggle-es"
      >
        ES
      </button>
    </div>
  );
}
