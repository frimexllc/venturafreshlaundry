import { useState } from "react";
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

/**
 * dark={false}  →  original (black text) for light/transparent pages
 * dark={true}   →  white text for dark backgrounds (CustomerLogin, etc.)
 */
export default function PublicNav({ dark = false }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useLocale();
  const customerToken = localStorage.getItem("customer_token");

  const navLabel = {
    services: t("Services", "Servicios"),
    about:    t("About",    "Nosotros"),
    contact:  t("Contact",  "Contacto"),
    store:    t("Store",    "Tienda"),
    blog:     t("Blog",     "Blog"),
  };

  const linkCls = dark
    ? "text-white/70 hover:text-white font-medium transition-all duration-150 hover:scale-105"
    : "text-black/90 hover:text-black font-medium transition-all duration-150 hover:scale-105";

  const activeCls = dark ? "text-white" : "text-black";

  return (
    <nav className="absolute top-0 left-0 right-0 z-50 py-4 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="group">
          <img
            src={logoVFL}
            alt="Ventura Fresh Laundry"
            className="h-28 md:h-36 lg:h-40 w-auto object-contain transition-transform duration-200 group-hover:scale-105"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link, idx) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) => `${linkCls} ${isActive ? activeCls : ""}`}
              style={{ transitionDelay: `${idx * 0.04}s` }}
            >
              {navLabel[link.key]}
            </NavLink>
          ))}

          <Link to={customerToken ? "/account" : "/account/login"} className={linkCls}>
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
          className={`md:hidden p-2 ${dark ? "text-white" : "text-black"}`}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
        </button>
      </div>

      {/* Mobile panel */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-4 px-4">
          <div className={`rounded-2xl p-4 ${dark
            ? "bg-slate-900/80 border border-white/10 backdrop-blur-md"
            : "bg-white/70 border border-black/10 backdrop-blur-md"
          }`}>
            <div className="flex flex-col gap-3">
              {navLinks.map(link => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `font-medium py-2 transition-colors duration-150 ${
                      dark
                        ? isActive ? "text-white" : "text-white/70 hover:text-white"
                        : isActive ? "text-black" : "text-black/80 hover:text-black"
                    }`
                  }
                >
                  {navLabel[link.key]}
                </NavLink>
              ))}
              <Link
                to={customerToken ? "/account" : "/account/login"}
                onClick={() => setMobileMenuOpen(false)}
                className={`font-medium py-2 ${dark ? "text-white/70 hover:text-white" : "text-black/80 hover:text-black"}`}
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