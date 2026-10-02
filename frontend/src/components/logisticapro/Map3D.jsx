// Map3D.jsx — Google Photorealistic 3D Maps (Maps JS API "maps3d" library,
// Preview release) for LogisticaPro. Renders a full-screen 3D globe view
// centered on HQ, with a live marker per active driver (updated via
// Socket.IO) and traffic-incident markers.
//
// NOTE: maps3d is a Preview API — the library's shape can still change
// upstream. Loaded with v=beta per Google's current docs (required for
// this library), separate from the stable v=weekly 2D map used elsewhere
// in the app (LogisticsMap's MapView.jsx) so neither load interferes
// with the other.
import { useEffect, useRef, useState } from 'react';

let googleMaps3DPromise = null;

function loadGoogleMaps3D(apiKey) {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google?.maps?.maps3d?.Map3DElement) return Promise.resolve(window.google);
  if (googleMaps3DPromise) return googleMaps3DPromise;

  googleMaps3DPromise = new Promise((resolve, reject) => {
    const onReady = async () => {
      try {
        await window.google.maps.importLibrary('maps3d');
        await window.google.maps.importLibrary('marker');
        resolve(window.google);
      } catch (e) {
        reject(e);
      }
    };

    if (window.google?.maps?.importLibrary) {
      onReady();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=beta&libraries=maps3d,marker&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error('Failed to load Google Maps 3D API'));
    document.head.appendChild(script);
  });

  return googleMaps3DPromise;
}

const DRIVER_PIN_COLOR = '#2563eb';

export default function Map3D({ hqLocation, driverLocations = [], trafficEvents = [], onMapReady }) {
  const containerRef = useRef(null);
  const map3DRef = useRef(null);
  const driverMarkersRef = useRef(new Map()); // user_id -> Marker3DElement
  const trafficMarkersRef = useRef([]);
  const libsRef = useRef(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  // ── 1. Load the 3D library and build the map ───────────────────────────
  useEffect(() => {
    if (!apiKey) {
      setLoadError('Falta REACT_APP_GOOGLE_MAPS_API_KEY');
      return;
    }
    let cancelled = false;

    loadGoogleMaps3D(apiKey)
      .then(async (google) => {
        if (cancelled || !containerRef.current) return;
        const maps3d = await google.maps.importLibrary('maps3d');
        const marker = await google.maps.importLibrary('marker');
        libsRef.current = { ...maps3d, ...marker };

        const map3D = new maps3d.Map3DElement({
          center: { lat: hqLocation.lat, lng: hqLocation.lng, altitude: 300 },
          range: 2500,
          tilt: 65,
          heading: 0,
          mode: maps3d.MapMode?.HYBRID || 'HYBRID',
        });
        map3D.style.width = '100%';
        map3D.style.height = '100%';

        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(map3D);
        map3DRef.current = map3D;

        setIsLoaded(true);
        onMapReady?.(map3D, maps3d);
      })
      .catch((err) => {
        console.error('LogisticaPro 3D map failed to load:', err);
        if (!cancelled) setLoadError('No se pudo cargar el mapa 3D. Es una función en Preview de Google — intenta recargar.');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // ── 2. Keep driver markers in sync with live positions ──────────────────
  useEffect(() => {
    if (!isLoaded || !libsRef.current || !map3DRef.current) return;
    const { Marker3DElement, PinElement } = libsRef.current;
    const map3D = map3DRef.current;
    const markers = driverMarkersRef.current;
    const seen = new Set();

    driverLocations.forEach((d) => {
      seen.add(d.user_id);
      const position = { lat: d.lat, lng: d.lng, altitude: 15 };
      let m = markers.get(d.user_id);
      if (m) {
        m.position = position;
        if (typeof d.heading === 'number') m.rotation = d.heading;
      } else {
        m = new Marker3DElement({
          position,
          altitudeMode: 'RELATIVE_TO_GROUND',
          label: d.name || 'Conductor',
          extruded: true,
        });
        try {
          const pin = new PinElement({ background: DRIVER_PIN_COLOR, borderColor: '#fff', glyphColor: '#fff' });
          m.append(pin.element);
        } catch {
          // PinElement append isn't critical — the label still shows if it fails.
        }
        map3D.append(m);
        markers.set(d.user_id, m);
      }
    });

    // Drop markers for drivers who are no longer active.
    for (const [userId, m] of markers.entries()) {
      if (!seen.has(userId)) {
        m.remove?.();
        markers.delete(userId);
      }
    }
  }, [isLoaded, driverLocations]);

  // ── 3. Traffic incident markers ──────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !libsRef.current || !map3DRef.current) return;
    const { Marker3DElement, PinElement } = libsRef.current;
    const map3D = map3DRef.current;

    trafficMarkersRef.current.forEach((m) => m.remove?.());
    trafficMarkersRef.current = [];

    const colorFor = (severity) =>
      severity === 'heavy' ? '#ef4444' : severity === 'moderate' ? '#f97316' : '#facc15';

    trafficEvents.forEach((ev) => {
      if (!ev.lat || !ev.lng) return;
      const m = new Marker3DElement({
        position: { lat: ev.lat, lng: ev.lng, altitude: 5 },
        altitudeMode: 'RELATIVE_TO_GROUND',
        label: ev.road || 'Tráfico',
      });
      try {
        const pin = new PinElement({ background: colorFor(ev.severity), borderColor: '#fff', glyphColor: '#fff', scale: 0.8 });
        m.append(pin.element);
      } catch {
        // Styling is best-effort; the plain marker still conveys the location.
      }
      map3D.append(m);
      trafficMarkersRef.current.push(m);
    });
  }, [isLoaded, trafficEvents]);

  if (loadError) {
    return (
      <div className="h-full w-full flex items-center justify-center text-red-400 bg-slate-950 p-6 text-center text-sm">
        {loadError}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-slate-950">
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm">
          Cargando mapa 3D…
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
