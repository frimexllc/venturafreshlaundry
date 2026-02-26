import { useState } from "react";
import { useLocale } from "../context/LocaleContext";
import LanguageToggle from "./LanguageToggle";
import { Link, NavLink } from "react-router-dom";
import { Button } from "./ui/button";
import { Menu, X } from "lucide-react";
import logoVFL from "../assets/LOGO2-fotor-bg-remover-2026011719450.webp";

const navLinks = [
  { path: "/services", key: "services" },
  { path: "/about", key: "about" },
  { path: "/contact", key: "contact" },
  { path: "/store", key: "store" },
  { path: "/blog", key: "blog" }
];

export default function PublicNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useLocale();
  const customerToken = localStorage.getItem("customer_token");

  const navLabel = {
    services: t("Services", "Servicios"),
    about: t("About", "Nosotros"),
    contact: t("Contact", "Contacto"),
    store: t("Store", "Tienda"),
    blog: t("Blog", "Blog")
  };

  return (
    <>
      {/* ✅ NAV TRANSPARENTE (igual al Landing) */}
      <nav className="absolute top-0 left-0 right-0 z-50 py-4 bg-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          {/* ✅ Logo grande igual al Landing */}
          <div className="flex items-center gap-3">
            <Link to="/" className="group">
              <img
                src={logoVFL}
                alt="Ventura Fresh Laundry"
                className="h-28 md:h-36 lg:h-40 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </Link>
          </div>

          {/* ✅ Desktop nav (igual al Landing) */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link, idx) => (
              <NavLink
                key={link.path}
                to={link.path}
                className={({ isActive }) =>
                  `text-black/90 hover:text-black font-medium transition-all duration-300 hover:scale-105 ${
                    isActive ? "text-black" : ""
                  }`
                }
                style={{ transitionDelay: `${idx * 0.05}s` }}
              >
                {navLabel[link.key]}
              </NavLink>
            ))}

            <Link
              to={customerToken ? "/account" : "/account/login"}
              className="text-black/90 hover:text-black font-medium transition-colors flex items-center gap-1 hover:scale-105 transition-transform duration-300"
            >
              {t("Account", "Cuenta")}
            </Link>

            <Link to="/schedule-pickup">
              <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full px-6 py-2.5 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl">
                {t("SCHEDULE PICK-UP", "PROGRAMAR RECOLECCIÓN")}
              </Button>
            </Link>
          </div>

          {/* ✅ Mobile menu button (NEGRO) */}
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden p-2 text-black"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
          </button>
        </div>

        {/* ✅ Mobile panel (transparente) con texto NEGRO */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 px-4">
            <div className="rounded-2xl border border-black/10 bg-white/70 backdrop-blur-md p-4">
              <div className="flex flex-col gap-3">
                {navLinks.map((link) => (
                  <NavLink
                    key={link.path}
                    to={link.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `font-medium py-2 transition-colors ${
                        isActive ? "text-black" : "text-black/80 hover:text-black"
                      }`
                    }
                  >
                    {navLabel[link.key]}
                  </NavLink>
                ))}

                <Link
                  to={customerToken ? "/account" : "/account/login"}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-black/80 hover:text-black font-medium py-2"
                >
                  Account
                </Link>

                <Link to="/schedule-pickup" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="bg-sky-500 hover:bg-sky-600 text-white rounded-full w-full mt-2 py-3">
                    {t("SCHEDULE PICK-UP", "PROGRAMAR RECOLECCIÓN")}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}