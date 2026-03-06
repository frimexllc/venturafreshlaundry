import logoVFL from "../assets/LOGO2-fotor-bg-remover-2026011719450.webp";

const titles = [
  "Freshness delivered to your door",
  "Premium care for every garment",
  "Laundry, simplified"
];

export default function PwaSplashScreen({ variant = 0 }) {
  const mode = ((variant % 3) + 3) % 3;

  return (
    <div className="pwa-splash-root pwa-splash-auto-hide" data-testid="pwa-splash-root">
      <div className="pwa-splash-orb pwa-splash-orb-a" />
      <div className="pwa-splash-orb pwa-splash-orb-b" />
      <div className="pwa-splash-grid" />

      <div className="pwa-splash-content" data-testid={`pwa-splash-variant-${mode}`}>
        {mode === 0 && (
          <div className="pwa-splash-a" data-testid="pwa-splash-fade-zoom">
            <img src={logoVFL} alt="Ventura Fresh Laundry" className="pwa-splash-logo-a" data-testid="pwa-splash-logo-a" />
          </div>
        )}

        {mode === 1 && (
          <div className="pwa-splash-b" data-testid="pwa-splash-pulse">
            <div className="pwa-splash-rings" data-testid="pwa-splash-rings">
              <span className="pwa-splash-ring pwa-splash-ring-1" />
              <span className="pwa-splash-ring pwa-splash-ring-2" />
              <span className="pwa-splash-ring pwa-splash-ring-3" />
            </div>
            <img src={logoVFL} alt="Ventura Fresh Laundry" className="pwa-splash-logo-b" data-testid="pwa-splash-logo-b" />
          </div>
        )}

        {mode === 2 && (
          <div className="pwa-splash-c" data-testid="pwa-splash-floating-bubbles">
            <img src={logoVFL} alt="Ventura Fresh Laundry" className="pwa-splash-logo-c" data-testid="pwa-splash-logo-c" />
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
