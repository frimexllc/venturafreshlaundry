import { useEffect, useState } from "react";
import logoVFL from "../assets/LOGO2-fotor-bg-remover-2026011719450.webp";

const titles = [
  "Freshness delivered to your door",
  "Premium care for every garment",
  "Laundry, simplified"
];

export default function PwaSplashScreen({ variant = 0, onComplete, duration = 1500 }) {
  const [isVisible, setIsVisible] = useState(true);
  const mode = ((variant % 3) + 3) % 3;

  useEffect(() => {
    // Optimización: Usar requestAnimationFrame para mejor performance
    const startTime = performance.now();
    
    const timer = setTimeout(() => {
      // Exit animation más suave
      const root = document.querySelector('[data-testid="pwa-splash-root"]');
      if (root) {
        root.style.opacity = '0';
        root.style.transform = 'scale(0.98)';
        root.style.transition = 'opacity 0.2s ease-out, transform 0.25s ease-out';
      }
      
      setTimeout(() => {
        setIsVisible(false);
        if (onComplete) onComplete();
      }, 200);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  if (!isVisible) return null;

  return (
    <div 
      className="pwa-splash-root" 
      data-testid="pwa-splash-root"
      style={{
        opacity: 1,
        transform: 'translateZ(0)',
        willChange: 'transform, opacity'
      }}
    >
      <div className="pwa-splash-orb pwa-splash-orb-a" />
      <div className="pwa-splash-orb pwa-splash-orb-b" />
      <div className="pwa-splash-grid" />

      <div className="pwa-splash-content" data-testid={`pwa-splash-variant-${mode}`}>
        {mode === 0 && (
          <div className="pwa-splash-a" data-testid="pwa-splash-fade-zoom">
            <img 
              src={logoVFL} 
              alt="Ventura Fresh Laundry" 
              className="pwa-splash-logo-a" 
              data-testid="pwa-splash-logo-a"
              loading="eager"
              fetchpriority="high"
            />
          </div>
        )}

        {mode === 1 && (
          <div className="pwa-splash-b" data-testid="pwa-splash-pulse">
            <div className="pwa-splash-rings" data-testid="pwa-splash-rings">
              <span className="pwa-splash-ring pwa-splash-ring-1" />
              <span className="pwa-splash-ring pwa-splash-ring-2" />
              {/* Eliminamos el tercer anillo para mejor performance */}
            </div>
            <img 
              src={logoVFL} 
              alt="Ventura Fresh Laundry" 
              className="pwa-splash-logo-b" 
              data-testid="pwa-splash-logo-b"
              loading="eager"
              fetchpriority="high"
            />
          </div>
        )}

        {mode === 2 && (
          <div className="pwa-splash-c" data-testid="pwa-splash-floating-bubbles">
            <img 
              src={logoVFL} 
              alt="Ventura Fresh Laundry" 
              className="pwa-splash-logo-c" 
              data-testid="pwa-splash-logo-c"
              loading="eager"
              fetchpriority="high"
            />
            <span className="pwa-splash-bubble pwa-splash-bubble-1" />
            <span className="pwa-splash-bubble pwa-splash-bubble-2" />
            <span className="pwa-splash-bubble pwa-splash-bubble-3" />
          </div>
        )}

        <div className="pwa-splash-text-wrap">
          <p className="pwa-splash-brand" data-testid="pwa-splash-brand">Ventura Fresh Laundry</p>
          <p className="pwa-splash-subtitle" data-testid="pwa-splash-subtitle">{titles[mode]}</p>
        </div>

        <div className="pwa-splash-progress" data-testid="pwa-splash-progress">
          <span className="pwa-splash-progress-bar" />
        </div>
      </div>
    </div>
  );
}