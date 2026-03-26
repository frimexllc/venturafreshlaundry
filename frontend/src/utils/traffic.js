const HOT_SPOTS = [
  { id: 'us101-ventura', road: 'US-101 Ventura', description: 'Trafico en el 101 saliendo de Ventura', lat: 34.2820, lng: -119.2680, tags: ['autopista'], morningRush: [7, 9], afternoonRush: [16, 19], morningDelay: { light: 6, moderate: 12, heavy: 22 }, afternoonDelay: { light: 5, moderate: 10, heavy: 18 } },
  { id: 'harbor-blvd', road: 'Harbor Blvd, Oxnard', description: 'Congestion en Harbor Blvd', lat: 34.2050, lng: -119.2180, tags: ['boulevard'], morningRush: [7, 8], afternoonRush: [17, 19], morningDelay: { light: 3, moderate: 7, heavy: 14 }, afternoonDelay: { light: 4, moderate: 9, heavy: 16 } },
  { id: 'victoria-ave', road: 'Victoria Ave, Ventura', description: 'Flujo lento en Victoria Ave', lat: 34.2589, lng: -119.2050, tags: ['avenida'], morningRush: [7, 9], afternoonRush: [16, 18], morningDelay: { light: 4, moderate: 8, heavy: 15 }, afternoonDelay: { light: 4, moderate: 9, heavy: 14 } },
  { id: 'telephone-rd', road: 'Telephone Rd, Ventura', description: 'Cruce congestionado en Telephone Rd', lat: 34.2519, lng: -119.2290, tags: ['local'], morningRush: [7, 8], afternoonRush: [17, 18], morningDelay: { light: 2, moderate: 5, heavy: 10 }, afternoonDelay: { light: 2, moderate: 5, heavy: 9 } },
  { id: 'gonzales-rd', road: 'Gonzales Rd, Oxnard', description: 'Trafico por construccion', lat: 34.2120, lng: -119.1520, tags: ['construccion'], morningRush: [7, 17], afternoonRush: [17, 17], morningDelay: { light: 3, moderate: 6, heavy: 10 }, afternoonDelay: { light: 3, moderate: 6, heavy: 10 } },
];

function getSeverity(hour, spot) {
  const [ms, me] = spot.morningRush;
  const [as_, ae] = spot.afternoonRush;
  if (!(hour >= ms && hour < me) && !(hour >= as_ && hour < ae)) return null;
  const rand = Math.random();
  if (rand < 0.25) return 'light';
  if (rand < 0.65) return 'moderate';
  return 'heavy';
}

export function getCurrentTrafficEvents() {
  const now = new Date();
  const hour = now.getHours();
  if (now.getDay() === 0 || now.getDay() === 6) return [];
  const events = [];
  for (const spot of HOT_SPOTS) {
    const severity = getSeverity(hour, spot);
    if (!severity) continue;
    const isPeakMorning = hour >= spot.morningRush[0] && hour < spot.morningRush[1];
    const delayMap = isPeakMorning ? spot.morningDelay : spot.afternoonDelay;
    events.push({ id: spot.id, road: spot.road, description: spot.description, lat: spot.lat, lng: spot.lng, severity, delayMinutes: delayMap[severity], tags: spot.tags });
  }
  return events;
}

export function totalTrafficDelay(events) {
  return events.reduce((sum, e) => sum + e.delayMinutes, 0);
}

export const SEVERITY_COLORS = { light: '#facc15', moderate: '#f97316', heavy: '#ef4444' };
export const SEVERITY_LABELS = { light: 'Leve', moderate: 'Moderado', heavy: 'Pesado' };
