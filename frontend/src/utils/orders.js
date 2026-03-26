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

export const MOCK_ORDERS = [
  {
    id: 'order-001', orderNumber: 'VFL-001', type: 'pickup-delivery', status: 'pending',
    customer: { name: 'Maria Rodriguez', phone: '(805) 555-0101', email: 'maria@email.com' },
    location: { address: '1234 Main St, Ventura, CA 93001', lat: 34.2805, lng: -119.2945, zipCode: '93001' },
    service: { weight: 15, items: ['Ropa casual', 'Toallas'], preferences: 'Sin suavizante' },
    pricing: { subtotal: 22.50, tax: 1.74, total: 24.24 },
    payment: { method: 'card', status: 'pending' },
    schedule: { pickupDate: '2026-02-10', pickupTime: '9:00 AM - 11:00 AM', deliveryDate: '2026-02-12', deliveryTime: '2:00 PM - 4:00 PM' },
    specialInstructions: 'Tocar el timbre dos veces',
    createdAt: '2026-02-09T14:30:00',
  },
  {
    id: 'order-002', orderNumber: 'VFL-002', type: 'airbnb', status: 'ready',
    customer: { name: 'Carlos Mendez', phone: '(805) 555-0202', email: 'carlos@airbnb.com' },
    location: { address: '567 Ocean Ave, Ventura, CA 93001', lat: 34.2712, lng: -119.2630, zipCode: '93001' },
    service: { weight: 30, items: ['Sabanas king', 'Fundas almohada', 'Toallas bano'], preferences: 'Blanqueado profesional' },
    pricing: { subtotal: 65.00, tax: 5.04, total: 70.04 },
    payment: { method: 'card', status: 'paid' },
    schedule: { pickupDate: '2026-02-09', pickupTime: '7:00 AM - 9:00 AM', deliveryDate: '2026-02-10', deliveryTime: '10:00 AM - 12:00 PM' },
    specialInstructions: 'Urgente - checkin 3PM',
    createdAt: '2026-02-08T16:00:00',
  },
  {
    id: 'order-003', orderNumber: 'VFL-003', type: 'b2b', status: 'pending',
    customer: { name: 'Restaurant El Sol', phone: '(805) 555-0303', email: 'info@elsol.com' },
    location: { address: '890 Victoria Ave, Ventura, CA 93003', lat: 34.2650, lng: -119.2450, zipCode: '93003' },
    service: { weight: 50, items: ['Manteles blancos', 'Servilletas lino', 'Uniformes cocina'], preferences: 'Almidon en manteles' },
    pricing: { subtotal: 95.00, tax: 7.36, total: 102.36 },
    payment: { method: 'zelle', status: 'pending' },
    schedule: { pickupDate: '2026-02-10', pickupTime: '8:00 AM - 10:00 AM', deliveryDate: '2026-02-11', deliveryTime: '6:00 AM - 8:00 AM' },
    specialInstructions: 'Entrada por atras del restaurante',
    createdAt: '2026-02-09T09:00:00',
  },
  {
    id: 'order-004', orderNumber: 'VFL-004', type: 'pickup-delivery', status: 'ready',
    customer: { name: 'Ana Patricia Vega', phone: '(805) 555-0404', email: 'ana@email.com' },
    location: { address: '345 E Thompson Blvd, Ventura, CA 93001', lat: 34.2735, lng: -119.2815, zipCode: '93001' },
    service: { weight: 12, items: ['Ropa delicada', 'Vestido formal'], preferences: 'Lavado en frio' },
    pricing: { subtotal: 35.00, tax: 2.71, total: 37.71 },
    payment: { method: 'card', status: 'paid' },
    schedule: { pickupDate: '2026-02-09', pickupTime: '10:00 AM - 12:00 PM', deliveryDate: '2026-02-11', deliveryTime: '3:00 PM - 5:00 PM' },
    specialInstructions: '',
    createdAt: '2026-02-09T11:15:00',
  },
  {
    id: 'order-005', orderNumber: 'VFL-005', type: 'wash-fold', status: 'pending',
    customer: { name: 'Jorge Hernandez', phone: '(805) 555-0505', email: 'jorge@email.com' },
    location: { address: '112 S Seaward Ave, Ventura, CA 93003', lat: 34.2690, lng: -119.2700, zipCode: '93003' },
    service: { weight: 20, items: ['Ropa general'], preferences: 'Detergente hipoalergenico' },
    pricing: { subtotal: 30.00, tax: 2.33, total: 32.33 },
    payment: { method: 'cash', status: 'pending' },
    schedule: { pickupDate: '2026-02-10', pickupTime: '11:00 AM - 1:00 PM', deliveryDate: '', deliveryTime: '' },
    specialInstructions: 'Cliente preferente - ofrecer membresia',
    createdAt: '2026-02-09T15:45:00',
  },
  {
    id: 'order-006', orderNumber: 'VFL-006', type: 'pickup-delivery', status: 'pending',
    customer: { name: 'Laura Chen', phone: '(805) 555-0606', email: 'laura.c@email.com' },
    location: { address: '2100 E Harbor Blvd, Ventura, CA 93001', lat: 34.2480, lng: -119.2350, zipCode: '93001' },
    service: { weight: 18, items: ['Edredones', 'Cobijas'], preferences: '' },
    pricing: { subtotal: 42.00, tax: 3.26, total: 45.26 },
    payment: { method: 'card', status: 'pending' },
    schedule: { pickupDate: '2026-02-10', pickupTime: '1:00 PM - 3:00 PM', deliveryDate: '2026-02-12', deliveryTime: '10:00 AM - 12:00 PM' },
    specialInstructions: '',
    createdAt: '2026-02-09T17:20:00',
  },
  {
    id: 'order-007', orderNumber: 'VFL-007', type: 'airbnb', status: 'ready',
    customer: { name: 'Pacific Coast Rentals', phone: '(805) 555-0707', email: 'ops@pcrentals.com' },
    location: { address: '450 San Jon Rd, Ventura, CA 93001', lat: 34.2575, lng: -119.2560, zipCode: '93001' },
    service: { weight: 40, items: ['Sabanas queen x4', 'Toallas set completo'], preferences: 'Doblado profesional' },
    pricing: { subtotal: 85.00, tax: 6.59, total: 91.59 },
    payment: { method: 'card', status: 'paid' },
    schedule: { pickupDate: '2026-02-09', pickupTime: '8:00 AM - 10:00 AM', deliveryDate: '2026-02-10', deliveryTime: '9:00 AM - 11:00 AM' },
    specialInstructions: '4 propiedades diferentes, ver lista adjunta',
    createdAt: '2026-02-08T22:00:00',
  },
];

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
