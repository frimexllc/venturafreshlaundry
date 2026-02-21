import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    // Si hay hash (#section) intenta scrollear a ese elemento
    if (hash) {
      requestAnimationFrame(() => {
        const el = document.querySelector(hash);
        if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
        else window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
      return;
    }

    // Default: siempre arriba al cambiar ruta
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, search, hash]);

  return null;
}