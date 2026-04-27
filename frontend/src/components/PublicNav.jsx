import { useState, useEffect, useRef } from "react";
import { useLocale } from "../context/LocaleContext";
import LanguageToggle from "./LanguageToggle";
import { Link, NavLink } from "react-router-dom";
import { Button } from "./ui/button";
import { Menu, X } from "lucide-react";
import logoVFL from "../assets/LOGO2-fotor-bg-remover-2026011719450.webp";

const navLinks = [
  { path: "/services", key: "services" },
  { path: "/about",    key: "about"    },
  { path: "/contact",  key: "contact"  },
  { path: "/store",    key: "store"    },
  { path: "/blog",     key: "blog"     },
];

// ─── Utilidad: mide luminancia media de una región del canvas ────────────────
function getRegionLuminance(canvas, x, y, w, h) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  try {
    const data = ctx.getImageData(x, y, w, h).data;
    let total = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      if (a < 0.1) continue; // ignora píxeles transparentes
      const r = data[i] * a;
      const g = data[i + 1] * a;
      const b = data[i + 2] * a;
      total += 0.299 * r + 0.587 * g + 0.114 * b;
      count++;
    }
    return count > 0 ? total / count : 128;
  } catch {
    return 128;
  }
}

// ─── Hook: detecta luminancia bajo el nav mediante screenshot de canvas ───────
function useNavBackground() {
  // Devuelve: { isDark: bool, luminance: 0-255 }
  const [state, setState] = useState({ isDark: true, luminance: 30 });

  useEffect(() => {
    let rafId = null;
    let lastScrollY = -1;
    let ticking = false;

    const detect = () => {
      // Método 1: data-nav-theme override en el elemento bajo el nav
      const x = Math.round(window.innerWidth / 2);
      const y = 90;
      const el = document.elementFromPoint(x, y);

      if (el) {
        let node = el;
        while (node && node !== document.body) {
          const theme = node.getAttribute?.("data-nav-theme");
          if (theme === "dark")  { setState({ isDark: true,  luminance: 30  }); return; }
          if (theme === "light") { setState({ isDark: false, luminance: 220 }); return; }
          node = node.parentElement;
        }
      }

      // Método 2: recorre el árbol buscando primer bg sólido
      if (el) {
        let node = el;
        while (node && node !== document.body) {
          const style = window.getComputedStyle(node);
          const bg = style.backgroundColor;

          if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") {
            node = node.parentElement;
            continue;
          }

          const nums = bg.match(/[\d.]+/g);
          if (!nums || nums.length < 3) { node = node.parentElement; continue; }

          const [r, g, b, a = 1] = nums.map(Number);
          if (a < 0.15) { node = node.parentElement; continue; }

          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          setState({ isDark: lum < 128, luminance: lum });
          return;
        }
      }

      // Método 3: fallback por scroll
      const scrollFraction = Math.min(window.scrollY / 300, 1);
      const lum = scrollFraction * 200; // asume que al hacer scroll el fondo se aclara
      setState({ isDark: window.scrollY < 100, luminance: window.scrollY < 100 ? 30 : 200 });
    };

    const onScroll = () => {
      if (!ticking) {
        rafId = requestAnimationFrame(() => {
          detect();
          ticking = false;
        });
        ticking = true;
      }
    };

    detect();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", detect, { passive: true });

    const mo = new MutationObserver(detect);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", detect);
      mo.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return state;
}

// ─── Calcula el filtro CSS para el logo según luminancia del fondo ────────────
// Estrategia:
//   - Fondo muy oscuro  (lum < 60):  logo normal (colores originales azul/blanco)
//   - Fondo medio-oscuro (60–128):   logo con ligero brillo blanco
//   - Fondo medio-claro (128–190):   logo oscurecido + drop-shadow
//   - Fondo muy claro   (>190):      logo con invert parcial o drop-shadow fuerte
function getLogoFilter(luminance, isDark) {
  if (luminance < 60) {
    // Fondo muy oscuro: logo azul original se ve perfecto, solo sombra leve
    return "drop-shadow(0 2px 8px rgba(255, 255, 255, 0.6))";
  }
  if (luminance < 128) {
    // Fondo oscuro medio: refuerza el brillo
    return "drop-shadow(0 2px 10px rgba(255, 255, 255, 0.7)) brightness(1.1)";
  }
  if (luminance < 190) {
    // Fondo gris/medio: el logo azul sigue siendo legible, oscurecemos ligeramente
    return "drop-shadow(0 2px 6px rgba(255, 255, 255, 0.5)) saturate(1.2)";
  }
  // Fondo muy claro/blanco: el logo blanco desaparece → aplicamos sombra fuerte + saturate
  return "drop-shadow(0 3px 12px rgba(255, 255, 255, 0.85)) saturate(1.3) brightness(0.9)";
}

// ─── Calcula clases de los links según luminancia ────────────────────────────
function getNavColors(luminance) {
  if (luminance < 128) {
    // Fondo oscuro → links blancos con sombra
    return {
      link:   "text-white hover:text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]",
      active: "!text-white underline underline-offset-4",
      burger: "text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]",
    };
  }
  if (luminance < 190) {
    // Fondo gris medio → links oscuros con sombra blanca para contraste
    return {
      link:   "text-slate-800 hover:text-slate-900 drop-shadow-[0_1px_3px_rgba(255,255,255,0.8)]",
      active: "!text-sky-700 underline underline-offset-4",
      burger: "text-slate-800 drop-shadow-[0_1px_3px_rgba(255,255,255,0.8)]",
    };
  }
  // Fondo muy claro → links azul oscuro nítidos
  return {
    link:   "text-slate-900 hover:text-sky-700 drop-shadow-[0_1px_2px_rgba(255,255,255,0.6)]",
    active: "!text-sky-600 underline underline-offset-4",
    burger: "text-slate-900",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PublicNav({ dark: forceDark }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useLocale();
  const customerToken = localStorage.getItem("customer_token");

  const { isDark: autoDark, luminance } = useNavBackground();

  // Si se pasa prop dark → sobreescribe detección automática
  const effectiveLuminance = forceDark !== undefined
    ? (forceDark ? 30 : 220)
    : luminance;
  const isDark = forceDark !== undefined ? forceDark : autoDark;

  const navLabel = {
    services: t("Services", "Servicios"),
    about:    t("About",    "Nosotros"),
    contact:  t("Contact",  "Contacto"),
    store:    t("Store",    "Tienda"),
    blog:     t("Blog",     "Blog"),
  };

  const logoFilter  = getLogoFilter(effectiveLuminance, isDark);
  const navColors   = getNavColors(effectiveLuminance);
  const linkBase    = "font-medium transition-all duration-300 hover:scale-105";

  return (
    <nav className="absolute top-0 left-0 right-0 z-50 py-4 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">

        {/* Logo con filtro adaptativo */}
        <Link to="/" className="group">
          <img
            src={logoVFL}
            alt="Ventura Fresh Laundry"
            className="h-28 md:h-36 lg:h-40 w-auto object-contain transition-all duration-500 ease-in-out group-hover:scale-105"
            style={{ filter: logoFilter }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link, idx) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) =>
                `${linkBase} ${navColors.link} ${isActive ? navColors.active : ""}`
              }
              style={{ transitionDelay: `${idx * 0.04}s` }}
            >
              {navLabel[link.key]}
            </NavLink>
          ))}

          <Link
            to={customerToken ? "/account" : "/account/login"}
            className={`${linkBase} ${navColors.link}`}
          >
            {t("Account", "Cuenta")}
          </Link>

          <Link to="/schedule-pickup">
            <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-6 py-2.5 transition-all duration-150 hover:scale-105 shadow-lg">
              {t("SCHEDULE PICK-UP", "PROGRAMAR RECOLECCIÓN")}
            </Button>
          </Link>

          <LanguageToggle className="ml-2" />
        </div>

        {/* Mobile burger */}
        <button
          onClick={() => setMobileMenuOpen(v => !v)}
          className={`md:hidden p-2 transition-colors duration-300 ${navColors.burger}`}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
        </button>
      </div>

      {/* Mobile panel — siempre oscuro para legibilidad */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-4 px-4">
          <div className="rounded-2xl p-4 bg-slate-900/90 border border-white/10 backdrop-blur-md">
            <div className="flex flex-col gap-3">
              {navLinks.map(link => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `font-medium py-2 transition-colors duration-150 ${
                      isActive ? "text-white" : "text-white/70 hover:text-white"
                    }`
                  }
                >
                  {navLabel[link.key]}
                </NavLink>
              ))}

              <Link
                to={customerToken ? "/account" : "/account/login"}
                onClick={() => setMobileMenuOpen(false)}
                className="font-medium py-2 text-white/70 hover:text-white"
              >
                {t("Account", "Cuenta")}
              </Link>

              <Link to="/schedule-pickup" onClick={() => setMobileMenuOpen(false)}>
                <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full w-full mt-2 py-3">
                  {t("SCHEDULE PICK-UP", "PROGRAMAR RECOLECCIÓN")}
                </Button>
              </Link>

              <div className="flex justify-center pt-2">
                <LanguageToggle />
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}