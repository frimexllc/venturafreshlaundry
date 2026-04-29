import { Link } from "react-router-dom";
import { useLocale } from "../context/LocaleContext";
import { MapPin, Clock, Phone } from "lucide-react";
import logoVFL from "../assets/LOGO2-fotor-bg-remover-2026011719450.webp";
import logoFrimexai from "../assets/logoFrimexai.jpeg";
import { useState, useEffect } from "react";

// ─── Hook: detecta luminancia bajo el footer ─────────────────────────────────────
function useFooterBackground() {
  const [luminance, setLuminance] = useState(50); // valor por defecto oscuro

  useEffect(() => {
    let rafId = null;
    let ticking = false;

    const detect = () => {
      // Detecta el fondo debajo del footer
      const footer = document.querySelector('footer');
      if (!footer) return;

      const rect = footer.getBoundingClientRect();
      const x = Math.round(window.innerWidth / 2);
      const y = Math.round(rect.top + 50); // Parte superior del footer

      const el = document.elementFromPoint(x, y);

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
          setLuminance(lum);
          return;
        }
      }
      
      // Fallback: el fondo del footer es slate-900 (oscuro)
      setLuminance(30);
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

  return luminance;
}

// ─── Filtro para el LOGO del footer según luminancia ───────────────────
function getFooterLogoFilter(luminance) {
if (luminance < 60) {
    // Logo completamente blanco + brillo externo
    return "brightness(0)  drop-shadow(0 0 15px rgba(255,255,255,0.8)) drop-shadow(0 0 5px rgba(255,255,255,0.5))";
  }
  if (luminance < 128) {
    // Blanco con sombra intensa
    return "brightness(0) invert(1) drop-shadow(0 0 10px rgba(255,255,255,0.6))";
  }
  if (luminance < 190) {
    // Blanco suave
    return "brightness(0) invert(0.85) drop-shadow(0 0 8px rgba(255,255,255,0.4))";
  }
  // Fondo claro: logo oscuro con sombra
  return "brightness(0.7) drop-shadow(0 2px 4px rgba(0,0,0,0.2))";
}

export default function PublicFooter() {
  const { t } = useLocale();
  const footerLuminance = useFooterBackground();
  const logoFilter = getFooterLogoFilter(footerLuminance);

  return (
    <footer className="bg-slate-900 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Logo & Contact Info - CON EFECTO DE LUMINANCIA */}
          <div className="md:col-span-1">
            <Link to="/" className="group inline-block">
              <img
                src={logoVFL}
                alt="Ventura Fresh Laundry"
                className="h-24 md:h-28 lg:h-32 w-auto object-contain transition-all duration-500 ease-in-out group-hover:scale-105"
                style={{ filter: logoFilter }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </Link>
            <div className="space-y-3 text-slate-300 text-sm mt-6">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>5722 Telephone Rd #5, Ventura, CA 93003</span>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 flex-shrink-0 mt-1" />
                <div className="text-sm leading-tight">
                  <div>
                    <strong>{t("Self-Service:", "Autoservicio:")}</strong>{" "}
                    {t("Mon-Sun 6:00 AM - 10:00 PM", "Lun-Dom 6:00 AM - 10:00 PM")}
                  </div>
                  <div className="text-xs">
                    {t("Last wash at 9:00 PM", "Última lavada a las 9:00 PM")}
                  </div>
                  <div className="mt-1">
                    <strong>{t("Wash & Fold:", "Lavado y Doblado:")}</strong>{" "}
                    {t("Mon-Sun 8:00 AM - 6:00 PM", "Lun-Dom 8:00 AM - 6:00 PM")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 flex-shrink-0" />
                <span>(820) 234-8181</span>
              </div>
            </div>
          </div>

          {/* Services - Links BLANCOS */}
          <div>
            <h4 className="font-semibold mb-4">{t("Services", "Servicios")}</h4>
            <div className="space-y-2 text-sm">
              <Link to="/services" className="block text-white/80 hover:text-white transition-colors">{t("All Services", "Todos los servicios")}</Link>
              <Link to="/schedule-pickup" className="block text-white/80 hover:text-white transition-colors">{t("Schedule Pickup", "Programar recolección")}</Link>
              <Link to="/membership" className="block text-white/80 hover:text-white transition-colors">{t("Memberships", "Membresías")}</Link>
              <Link to="/request-quote" className="block text-white/80 hover:text-white transition-colors">{t("Commercial/B2B", "Comercial/B2B")}</Link>
            </div>
          </div>

          {/* Company - Links BLANCOS */}
          <div>
            <h4 className="font-semibold mb-4">{t("Company", "Empresa")}</h4>
            <div className="space-y-2 text-sm">
              <Link to="/about" className="block text-white/80 hover:text-white transition-colors">{t("About Us", "Sobre nosotros")}</Link>
              <Link to="/contact" className="block text-white/80 hover:text-white transition-colors">{t("Contact Us", "Contáctanos")}</Link>
              <Link to="/blog" className="block text-white/80 hover:text-white transition-colors">{t("Blog", "Blog")}</Link>
              <Link to="/store" className="block text-white/80 hover:text-white transition-colors">{t("Store", "Tienda")}</Link>
              <Link to="/terms-and-conditions" className="block text-white/80 hover:text-white transition-colors" data-testid="footer-terms-link">{t("Terms and Conditions", "Términos y condiciones")}</Link>
              <Link to="/privacy-policy" className="block text-white/80 hover:text-white transition-colors" data-testid="footer-privacy-link">{t("Privacy Policy", "Política de privacidad")}</Link>
              <Link to="/sms-policy-consent" className="block text-white/80 hover:text-white transition-colors" data-testid="footer-sms-policy-link">{t("SMS Policy", "Política SMS")}</Link>
            </div>
          </div>

          {/* Account & Social - Links BLANCOS */}
          <div>
            <h4 className="font-semibold mb-4">{t("Account", "Cuenta")}</h4>
            <div className="space-y-2 text-sm">
              <Link to="/account" className="block text-white/80 hover:text-white transition-colors">{t("My Account", "Mi cuenta")}</Link>
              <Link to="/account/login" className="block text-white/80 hover:text-white transition-colors">{t("Customer Login", "Acceso clientes")}</Link>
              <Link to="/login" className="block text-white/80 hover:text-white transition-colors">{t("Staff Login", "Acceso personal")}</Link>
            </div>
            {/* Social Icons */}
            <div className="flex gap-4 mt-6">
              <a href="https://instagram.com/venturafreshlaundry" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white transition-colors">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </a>
              <a href="https://facebook.com/venturafreshlaundry" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white transition-colors">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
              <a href="https://www.tiktok.com/@venturafreshlaundry" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white transition-colors">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Logo Frimexai justo arriba del copyright */}
        <div className="flex justify-center mb-4">
          <a
            href="https://frimexllc.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={logoFrimexai}
              alt="FRIMEX LLC"
              className="h-8 w-auto opacity-80 hover:opacity-100 transition-opacity"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </a>
        </div>
        
        <div className="border-t border-slate-800 pt-8">
          <p className="text-center text-slate-400 text-sm">
            © {new Date().getFullYear()} Ventura Fresh Laundry, operated by FRIMEX LLC. {t("All rights reserved.", "Todos los derechos reservados.")}
          </p>
        </div>
      </div>
    </footer>
  );
}