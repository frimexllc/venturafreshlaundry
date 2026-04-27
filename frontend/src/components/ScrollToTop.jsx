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

    // ★ Comportamiento especial para páginas con formulario
    if (pathname === "/schedule-pickup") {
      requestAnimationFrame(() => {
        const formContainer = document.getElementById("schedule-pickup-form");
        if (formContainer) {
          formContainer.scrollIntoView({ behavior: "auto", block: "start" });
        } else {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
      });
      return;
    }

    // ★ Wash & Fold
    if (pathname === "/wash-fold") {
      requestAnimationFrame(() => {
        const formContainer = document.getElementById("wash-fold-form");
        if (formContainer) {
          formContainer.scrollIntoView({ behavior: "auto", block: "start" });
        } else {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
      });
      return;
    }

    // ★ Cotización comercial B2B
    if (pathname === "/request-quote" || pathname === "/commercial" || pathname === "/b2b") {
      requestAnimationFrame(() => {
        const formContainer = document.getElementById("b2b-quote-form");
        if (formContainer) {
          formContainer.scrollIntoView({ behavior: "auto", block: "start" });
        } else {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
      });
      return;
    }

    // Default: siempre arriba al cambiar ruta
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, search, hash]);

  return null;
}