// src/utils/traffic.js

// ========== CONSTANTES DE TRÁFICO ==========
const HOT_SPOTS = [
  { id: 'us101-ventura-n', road: 'US-101 North Ventura', description: 'Tráfico en el 101 norte saliendo de Ventura', lat: 34.2820, lng: -119.2680, tags: ['autopista'], morningRush: [7, 9], afternoonRush: [16, 19], morningDelay: { light: 6, moderate: 12, heavy: 22 }, afternoonDelay: { light: 5, moderate: 10, heavy: 18 } },
  { id: 'us101-ventura-s', road: 'US-101 South Ventura', description: 'Tráfico en el 101 sur hacia Oxnard', lat: 34.2500, lng: -119.2400, tags: ['autopista'], morningRush: [7, 9], afternoonRush: [16, 19], morningDelay: { light: 5, moderate: 11, heavy: 20 }, afternoonDelay: { light: 6, moderate: 12, heavy: 19 } },
  { id: 'harbor-blvd', road: 'Harbor Blvd, Oxnard', description: 'Congestión en Harbor Blvd', lat: 34.2050, lng: -119.2180, tags: ['boulevard'], morningRush: [7, 8], afternoonRush: [17, 19], morningDelay: { light: 3, moderate: 7, heavy: 14 }, afternoonDelay: { light: 4, moderate: 9, heavy: 16 } },
  { id: 'victoria-ave', road: 'Victoria Ave, Ventura', description: 'Flujo lento en Victoria Ave', lat: 34.2589, lng: -119.2050, tags: ['avenida'], morningRush: [7, 9], afternoonRush: [16, 18], morningDelay: { light: 4, moderate: 8, heavy: 15 }, afternoonDelay: { light: 4, moderate: 9, heavy: 14 } },
  { id: 'telephone-rd', road: 'Telephone Rd, Ventura', description: 'Cruce congestionado en Telephone Rd', lat: 34.2519, lng: -119.2290, tags: ['local'], morningRush: [7, 8], afternoonRush: [17, 18], morningDelay: { light: 2, moderate: 5, heavy: 10 }, afternoonDelay: { light: 2, moderate: 5, heavy: 9 } },
  { id: 'gonzales-rd', road: 'Gonzales Rd, Oxnard', description: 'Tráfico por construcción', lat: 34.2120, lng: -119.1520, tags: ['construccion'], morningRush: [7, 17], afternoonRush: [17, 17], morningDelay: { light: 3, moderate: 6, heavy: 10 }, afternoonDelay: { light: 3, moderate: 6, heavy: 10 } },
  { id: 'esplanade-dr', road: 'Esplanade Dr, Oxnard', description: 'Congestión en centro comercial', lat: 34.1900, lng: -119.1900, tags: ['comercial'], morningRush: [10, 12], afternoonRush: [14, 20], morningDelay: { light: 2, moderate: 4, heavy: 8 }, afternoonDelay: { light: 3, moderate: 6, heavy: 12 } },
  { id: 'main-st-ventura', road: 'Main St, Ventura', description: 'Tráfico en el centro de Ventura', lat: 34.2800, lng: -119.2900, tags: ['centro'], morningRush: [8, 10], afternoonRush: [17, 19], morningDelay: { light: 3, moderate: 6, heavy: 11 }, afternoonDelay: { light: 4, moderate: 7, heavy: 13 } },
  { id: 'rose-ave', road: 'Rose Ave, Oxnard', description: 'Flujo lento en Rose Ave', lat: 34.2300, lng: -119.1700, tags: ['avenida'], morningRush: [7, 9], afternoonRush: [16, 18], morningDelay: { light: 2, moderate: 5, heavy: 9 }, afternoonDelay: { light: 3, moderate: 6, heavy: 10 } },
];

// ========== HELPER: distancia haversine (km) ==========
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ========== GENERAR INCIDENTES MOCK ==========
function getSeverity(hour, spot) {
  const [ms, me] = spot.morningRush;
  const [as_, ae] = spot.afternoonRush;
  // For testing: always return some severity, even outside rush hour
  if (!(hour >= ms && hour < me) && !(hour >= as_ && hour < ae)) {
    const rand = Math.random();
    if (rand < 0.5) return 'light';
    if (rand < 0.8) return 'moderate';
    return 'heavy';
  }
  const rand = Math.random();
  if (rand < 0.25) return 'light';
  if (rand < 0.65) return 'moderate';
  return 'heavy';
}

export function getCurrentTrafficEvents() {
  const now = new Date();
  const hour = now.getHours();
  const events = [];
  for (const spot of HOT_SPOTS) {
    const severity = getSeverity(hour, spot);
    if (!severity) continue;
    const isPeakMorning = hour >= spot.morningRush[0] && hour < spot.morningRush[1];
    const isPeakAfternoon = hour >= spot.afternoonRush[0] && hour < spot.afternoonRush[1];
    const delayMap = isPeakMorning ? spot.morningDelay : (isPeakAfternoon ? spot.afternoonDelay : { light: 2, moderate: 4, heavy: 8 });
    events.push({
      id: spot.id,
      road: spot.road,
      description: spot.description,
      lat: spot.lat,
      lng: spot.lng,
      severity,
      delayMinutes: delayMap[severity],
      tags: spot.tags,
    });
  }
  return events;
}

// ========== FUNCIÓN CORREGIDA: solo suma incidentes cerca de la ruta ==========
/**
 * Calcula el retraso total por tráfico, considerando solo incidentes
 * a menos de maxDistanceKm de cualquier punto de la ruta (waypoints).
 * @param {Array} trafficEvents - Lista de incidentes
 * @param {Array} routeWaypoints - Array de puntos {lat, lng} de la ruta (incluye HQ)
 * @param {number} maxDistanceKm - Distancia máxima en km para considerar un incidente relevante
 * @returns {number} - Minutos de retraso total
 */
export function totalTrafficDelay(trafficEvents, routeWaypoints = [], maxDistanceKm = 3.0) {
  if (!trafficEvents.length) return 0;
  // Si no hay waypoints (ruta vacía), no hay retraso relevante
  if (!routeWaypoints || routeWaypoints.length === 0) return 0;

  const relevantEvents = trafficEvents.filter(event => {
    if (!event.lat || !event.lng) return false;
    // Verificar si el incidente está cerca de ALGÚN waypoint
    for (const wp of routeWaypoints) {
      const dist = haversineDistance(wp.lat, wp.lng, event.lat, event.lng);
      if (dist <= maxDistanceKm) return true;
    }
    return false;
  });

  return relevantEvents.reduce((sum, e) => sum + (e.delayMinutes || 0), 0);
}

// ========== EXPORTACIONES AUXILIARES ==========
export const SEVERITY_COLORS = { light: '#facc15', moderate: '#f97316', heavy: '#ef4444' };
export const SEVERITY_LABELS = { light: 'Leve', moderate: 'Moderado', heavy: 'Pesado' };