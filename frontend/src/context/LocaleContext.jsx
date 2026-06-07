import { createContext, useContext, useEffect, useMemo, useState } from "react";

const LocaleContext = createContext(null);
const STORAGE_KEY = "vfl_locale";

const FALLBACK_ES_TRANSLATIONS = {
  "Save": "Guardar",
  "Update": "Actualizar",
  "Create": "Crear",
  "Delete": "Eliminar",
  "Cancel": "Cancelar",
  "Close": "Cerrar",
  "Next": "Siguiente",
  "Previous": "Anterior",
  "Back": "Volver",
  "Continue": "Continuar",
  "Search": "Buscar",
  "Filter": "Filtrar",
  "Print": "Imprimir",
  "Edit": "Editar",
  "Open": "Abrir",
  "Submit": "Enviar",
  "Confirm": "Confirmar"
};

const fallbackTranslateToEs = (text) => {
  if (typeof text !== "string") return text;
  return FALLBACK_ES_TRANSLATIONS[text] || text;
};

export const LocaleProvider = ({ children }) => {
  const [locale, setLocale] = useState(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem(STORAGE_KEY) || "en";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (enText, esText) => (locale === "es" ? (esText || fallbackTranslateToEs(enText)) : enText),
    }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useLocale = () => {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
};