export const ORDER_TYPE_COLORS = {
  'pickup-delivery': '#3b82f6',
  'wash-fold': '#10b981',
  'airbnb': '#f59e0b',
  'b2b': '#8b5cf6',
  'self-service': '#ec4899',
};

export const ORDER_TYPE_LABELS = {
  'pickup-delivery': 'Pickup & Delivery',
  'wash-fold': 'Wash & Fold (Drop-off)',
  'airbnb': 'Airbnb Specialist',
  'b2b': 'B2B Solution',
  'self-service': 'Self Service',
};

export const ORDER_STATUS_LABELS = {
  'pending': 'Pendiente',
  'picked-up': 'Recolectado',
  'in-process': 'En Proceso',
  'ready': 'Listo p/ Entrega',
  'shipping': 'En Camino',
  'delivered': 'Entregado',
  'new': 'Nuevo',
  'confirmed': 'Confirmado',
  'pickup_scheduled': 'Pickup Agendado',
  'out_for_delivery': 'En Camino',
};

export const PAYMENT_METHOD_LABELS = {
  'card': 'Tarjeta',
  'zelle': 'Transferencia (Zelle)',
  'cash': 'Efectivo',
  'transfer': 'Transferencia',
};

const EARTH_RADIUS_MILES = 3959;
const AVG_SPEED_MPH = 28;
const SERVICE_STOP_MINUTES = 5;
const WORK_START_HOUR = 7;
const WORK_END_HOUR = 19;

const TYPE_PRIORITY = {
  airbnb: 5,
  b2b: 4,
  'pickup-delivery': 3,
  'wash-fold': 2,
  'self-service': 1,
};

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parsePickupTime(timeStr) {
  if (!timeStr) return { start: WORK_START_HOUR * 60, end: WORK_END_HOUR * 60 };
  const clean = timeStr.split('-')[0].trim();
  const match = clean.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return { start: WORK_START_HOUR * 60, end: WORK_END_HOUR * 60 };
  let hours = parseInt(match[1]);
  const mins = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  const start = hours * 60 + mins;
  const endMatch = timeStr.match(/-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (endMatch) {
    let eh = parseInt(endMatch[1]);
    const em = parseInt(endMatch[2]);
    if (endMatch[3].toUpperCase() === 'PM' && eh !== 12) eh += 12;
    return { start, end: eh * 60 + em };
  }
  return { start, end: start + 120 };
}

function minutesToTimeStr(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

function totalRouteDistance(route, start) {
  let dist = 0;
  let cur = start;
  for (const o of route) {
    dist += haversineDistance(cur.lat, cur.lng, o.location.lat, o.location.lng);
    cur = { lat: o.location.lat, lng: o.location.lng };
  }
  return dist;
}

function nearestNeighborWithUrgency(orders, start) {
  const unvisited = [...orders];
  const route = [];
  let cur = start;
  let currentMinutes = WORK_START_HOUR * 60;
  while (unvisited.length > 0) {
    let bestIndex = 0;
    let bestScore = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const o = unvisited[i];
      const dist = haversineDistance(cur.lat, cur.lng, o.location.lat, o.location.lng);
      const travelMins = (dist / AVG_SPEED_MPH) * 60;
      const arrivalMins = currentMinutes + travelMins + SERVICE_STOP_MINUTES;
      const { start: twStart } = parsePickupTime(o.schedule?.pickupTime);
      const priority = TYPE_PRIORITY[o.type] || 3;
      const lateness = Math.max(0, arrivalMins - twStart) / 60;
      const urgencyPenalty = (6 - priority) * 2;
      const score = dist + lateness * 5 + urgencyPenalty;
      if (score < bestScore) { bestScore = score; bestIndex = i; }
    }
    const next = unvisited.splice(bestIndex, 1)[0];
    route.push(next);
    const d = haversineDistance(cur.lat, cur.lng, next.location.lat, next.location.lng);
    currentMinutes += (d / AVG_SPEED_MPH) * 60 + SERVICE_STOP_MINUTES;
    cur = { lat: next.location.lat, lng: next.location.lng };
  }
  return route;
}

function twoOptImprove(route, start, maxIterations = 500) {
  let best = [...route];
  let bestDist = totalRouteDistance(best, start);
  let improved = true;
  let iterations = 0;
  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const candidateDist = totalRouteDistance(candidate, start);
        if (candidateDist < bestDist - 0.001) { best = candidate; bestDist = candidateDist; improved = true; }
      }
    }
  }
  return best;
}

function repairTimeWindows(route, start) {
  const repaired = [...route];
  let changed = true;
  let passes = 0;
  while (changed && passes < 20) {
    changed = false;
    passes++;
    let currentMinutes = WORK_START_HOUR * 60;
    let cur = start;
    for (let i = 0; i < repaired.length; i++) {
      const o = repaired[i];
      const dist = haversineDistance(cur.lat, cur.lng, o.location.lat, o.location.lng);
      currentMinutes += (dist / AVG_SPEED_MPH) * 60 + SERVICE_STOP_MINUTES;
      const { end: twEnd } = parsePickupTime(o.schedule?.pickupTime);
      if (currentMinutes > twEnd + 30 && i > 0) {
        let bestPos = i;
        let bestPenalty = currentMinutes - twEnd;
        for (let j = 0; j < i; j++) {
          const test = [...repaired.slice(0, j), o, ...repaired.slice(j, i), ...repaired.slice(i + 1)];
          let cm = WORK_START_HOUR * 60;
          let cc = start;
          let penalty = 0;
          for (let k = 0; k <= j; k++) {
            const d2 = haversineDistance(cc.lat, cc.lng, test[k].location.lat, test[k].location.lng);
            cm += (d2 / AVG_SPEED_MPH) * 60 + SERVICE_STOP_MINUTES;
            const { end: e } = parsePickupTime(test[k].schedule?.pickupTime);
            if (cm > e + 30) penalty += cm - e;
            cc = { lat: test[k].location.lat, lng: test[k].location.lng };
          }
          if (penalty < bestPenalty) { bestPenalty = penalty; bestPos = j; }
        }
        if (bestPos !== i) { const moved = repaired.splice(i, 1)[0]; repaired.splice(bestPos, 0, moved); changed = true; break; }
      }
      cur = { lat: o.location.lat, lng: o.location.lng };
    }
  }
  return repaired;
}

function buildStopDetails(route, start) {
  const stops = [];
  let cur = start;
  let currentMinutes = WORK_START_HOUR * 60;
  let cumDist = 0;
  for (let i = 0; i < route.length; i++) {
    const o = route[i];
    const dist = haversineDistance(cur.lat, cur.lng, o.location.lat, o.location.lng);
    currentMinutes += (dist / AVG_SPEED_MPH) * 60 + SERVICE_STOP_MINUTES;
    cumDist += dist;
    const { start: twStart, end: twEnd } = parsePickupTime(o.schedule?.pickupTime);
    const priority = TYPE_PRIORITY[o.type] || 3;
    let urgencyLevel = 'flexible';
    if (priority >= 5 || (twEnd - twStart) <= 60) urgencyLevel = 'critical';
    else if (priority >= 4 || (twEnd - twStart) <= 120) urgencyLevel = 'high';
    else if (priority >= 3) urgencyLevel = 'normal';
    stops.push({
      order: o,
      stopNumber: i + 1,
      distanceFromPrev: Math.round(dist * 10) / 10,
      cumulativeDistance: Math.round(cumDist * 10) / 10,
      estimatedArrival: minutesToTimeStr(Math.round(currentMinutes)),
      arrivalMinutes: Math.round(currentMinutes),
      urgencyLevel,
      timeWindowStart: twStart,
      timeWindowEnd: twEnd,
      onTime: currentMinutes <= twEnd + 15,
      priorityScore: priority,
    });
    cur = { lat: o.location.lat, lng: o.location.lng };
  }
  return stops;
}

export function optimizeRouteAdvanced(orders, startLocation = { lat: 34.2519, lng: -119.2290 }) {
  if (orders.length === 0) {
    return { stops: [], totalDistance: 0, naiveDistance: 0, savedMiles: 0, estimatedDuration: 0, estimatedFuelCost: 0, routeScore: 100, violations: 0, algorithm: '2-opt + Time Windows' };
  }
  const initialRoute = nearestNeighborWithUrgency(orders, startLocation);
  const naiveDistance = totalRouteDistance(initialRoute, startLocation);
  const improvedRoute = twoOptImprove(initialRoute, startLocation);
  const finalRoute = repairTimeWindows(improvedRoute, startLocation);
  const td = totalRouteDistance(finalRoute, startLocation);
  const stops = buildStopDetails(finalRoute, startLocation);
  const violations = stops.filter((s) => !s.onTime).length;
  const savedMiles = Math.max(0, naiveDistance - td);
  const estimatedDuration = stops.length > 0 ? stops[stops.length - 1].arrivalMinutes - WORK_START_HOUR * 60 : 0;
  const maxPossibleDist = orders.length * 5;
  const distScore = Math.max(0, 100 - (td / maxPossibleDist) * 50);
  const routeScore = Math.max(0, Math.round(distScore - violations * 15));
  return {
    stops, totalDistance: Math.round(td * 10) / 10, naiveDistance: Math.round(naiveDistance * 10) / 10,
    savedMiles: Math.round(savedMiles * 10) / 10, estimatedDuration,
    estimatedFuelCost: Math.round(td * 0.18 * 100) / 100, routeScore, violations,
    algorithm: '2-opt + Ventanas de Tiempo',
  };
}

export function mapBackendOrder(o) {
  const lat = o.location?.lat || 34.2519 + (Math.random() - 0.5) * 0.06;
  const lng = o.location?.lng || -119.2290 + (Math.random() - 0.5) * 0.06;
  const st = (o.status || 'new').toLowerCase().replace(/ /g, '_');
  let mappedStatus = 'pending';
  if (['ready', 'out_for_delivery', 'shipping'].includes(st)) mappedStatus = 'ready';
  else if (['in_process', 'in-process', 'processing', 'washing'].includes(st)) mappedStatus = 'in-process';
  else if (['picked_up', 'picked-up'].includes(st)) mappedStatus = 'picked-up';
  else if (['delivered', 'completed'].includes(st)) mappedStatus = 'delivered';
  else if (['confirmed', 'pickup_scheduled'].includes(st)) mappedStatus = 'pending';
  let mappedType = 'pickup-delivery';
  const svc = (o.service_type || '').toLowerCase();
  if (svc.includes('wash') && svc.includes('fold')) mappedType = 'wash-fold';
  else if (svc.includes('airbnb')) mappedType = 'airbnb';
  else if (svc.includes('b2b') || svc.includes('commercial')) mappedType = 'b2b';
  else if (svc.includes('self')) mappedType = 'self-service';
  const total = o.total_amount || 0;
  return {
    id: o.id,
    orderNumber: o.order_number || `VFL-${o.id?.slice(0, 8) || '000'}`,
    type: mappedType,
    status: mappedStatus,
    customer: {
      name: o.customer_name || 'Cliente',
      phone: o.customer_phone || '',
      email: o.customer_email || '',
    },
    location: { address: o.pickup_address || o.delivery_address || '', lat, lng, zipCode: '' },
    service: {
      weight: o.estimated_lbs || o.actual_lbs || null,
      preferences: o.notes || '',
    },
    pricing: { subtotal: total * 0.9225, tax: total * 0.0775, total },
    payment: {
      method: o.payment_method || 'card',
      status: o.payment_status || 'pending',
    },
    schedule: {
      pickupDate: o.pickup_date || '',
      pickupTime: o.pickup_time_window || '09:00 AM',
      deliveryDate: '',
      deliveryTime: '',
    },
    specialInstructions: o.notes || '',
    createdAt: o.created_at || new Date().toISOString(),
    _backendId: o.id,
  };
}
