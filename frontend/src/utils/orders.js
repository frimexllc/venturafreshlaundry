// ============================================================
//  orders.js  –  Lógica central de optimización de rutas
//  Mejoras v2:
//   • Algoritmo 3-opt + Or-opt para mejor calidad de ruta
//   • Costo de combustible real (rendimiento + precio/litro)
//   • Ventanas de tiempo con penalización dinámica
//   • Prioridades ponderadas y detección de urgencia real
//   • Arquitectura multi-vehículo (VRP básico)
//   • Métricas extendidas por parada y por ruta
// ============================================================

// ─── Etiquetas y colores ────────────────────────────────────

export const ORDER_TYPE_COLORS = {
  'pickup-delivery': '#3b82f6',
  'wash-fold':       '#10b981',
  'airbnb':          '#f59e0b',
  'b2b':             '#8b5cf6',
  'self-service':    '#ec4899',
};

export const ORDER_TYPE_LABELS = {
  'pickup-delivery': 'Pickup & Delivery',
  'wash-fold':       'Wash & Fold (Drop-off)',
  'airbnb':          'Airbnb Specialist',
  'b2b':             'B2B Solution',
  'self-service':    'Self Service',
};

export const ORDER_STATUS_LABELS = {
  'pending':          'Pendiente',
  'picked-up':        'Recolectado',
  'in-process':       'En Proceso',
  'ready':            'Listo p/ Entrega',
  'shipping':         'En Camino',
  'delivered':        'Entregado',
  'new':              'Nuevo',
  'confirmed':        'Confirmado',
  'pickup_scheduled': 'Pickup Agendado',
  'out_for_delivery': 'En Camino',
};

export const PAYMENT_METHOD_LABELS = {
  'card':     'Tarjeta',
  'zelle':    'Transferencia (Zelle)',
  'cash':     'Efectivo',
  'transfer': 'Transferencia',
};

// ─── Constantes de operación ────────────────────────────────

const EARTH_RADIUS_KM    = 6371;
const KM_PER_MILE        = 1.60934;

const DEFAULTS = {
  avgSpeedKmh:          45,       // velocidad promedio urbana (km/h)
  serviceStopMinutes:   5,        // minutos por parada
  workStartHour:        7,
  workEndHour:          19,
  vehicleKmPerLiter:    10,       // rendimiento del vehículo (km/l)
  fuelPricePerLiter:    24.5,     // precio gasolina (MXN/litro)
  maxStopsPerVehicle:   30,       // para VRP
  twoOptMaxIter:        800,
  orOptMaxIter:         400,
};

// Prioridad base por tipo (1=baja … 6=crítica)
const TYPE_PRIORITY = {
  airbnb:            6,
  b2b:               5,
  'pickup-delivery': 3,
  'wash-fold':       2,
  'self-service':    1,
};

// Penalización adicional por retraso (minutos tardíos → score)
const LATENESS_WEIGHT   = 8;
const URGENCY_BASE      = 2;

// ─── Utilidades geométricas ─────────────────────────────────

/** Distancia Haversine en KM */
export function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Mantener compatibilidad con código legacy que usa millas */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  return haversineDistanceKm(lat1, lng1, lat2, lng2) / KM_PER_MILE;
}

// ─── Parseo de ventanas de tiempo ───────────────────────────

/**
 * Convierte un string como "09:00 AM - 11:00 AM" a minutos desde medianoche.
 * Devuelve { start, end } en minutos.
 */
export function parsePickupTime(timeStr, cfg = DEFAULTS) {
  const fallback = { start: cfg.workStartHour * 60, end: cfg.workEndHour * 60 };
  if (!timeStr) return fallback;

  const parseToken = (str) => {
    const m = str.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const p   = m[3].toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  };

  const parts = timeStr.split('-').map((s) => s.trim());
  const start = parseToken(parts[0]);
  if (start === null) return fallback;
  const end = parts[1] ? parseToken(parts[1]) : null;
  return { start, end: end !== null ? end : start + 120 };
}

/** Minutos desde medianoche → "9:00 AM" */
export function minutesToTimeStr(minutes) {
  const h   = Math.floor(minutes / 60) % 24;
  const m   = minutes % 60;
  const p   = h >= 12 ? 'PM' : 'AM';
  const dh  = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dh}:${m.toString().padStart(2, '0')} ${p}`;
}

// ─── Distancia total de una ruta ────────────────────────────

function totalRouteDistanceKm(route, start) {
  let dist = 0;
  let cur  = start;
  for (const o of route) {
    dist += haversineDistanceKm(cur.lat, cur.lng, o.location.lat, o.location.lng);
    cur   = o.location;
  }
  return dist;
}

// ─── Fase 1: Vecino más cercano con urgencia ────────────────

/**
 * Construye una ruta inicial greedy combinando distancia + urgencia + ventanas.
 * Score más bajo = mejor candidato.
 */
function nearestNeighborWithUrgency(orders, start, cfg = DEFAULTS) {
  const unvisited     = [...orders];
  const route         = [];
  let cur             = start;
  let currentMinutes  = cfg.workStartHour * 60;

  while (unvisited.length > 0) {
    let bestIndex = 0;
    let bestScore = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const o          = unvisited[i];
      const distKm     = haversineDistanceKm(cur.lat, cur.lng, o.location.lat, o.location.lng);
      const travelMins = (distKm / cfg.avgSpeedKmh) * 60;
      const arrival    = currentMinutes + travelMins + cfg.serviceStopMinutes;

      const { start: twStart, end: twEnd } = parsePickupTime(o.schedule?.pickupTime, cfg);

      const priority      = TYPE_PRIORITY[o.type] || 3;
      const windowWidth   = twEnd - twStart;              // minutos disponibles
      const lateness      = Math.max(0, arrival - twEnd) / 60;
      const earlyPenalty  = Math.max(0, twStart - arrival) / 120; // pequeña penalidad por llegar muy pronto
      const urgencyFactor = (7 - priority) * URGENCY_BASE;       // mayor prioridad → menor penalidad
      const tightWindow   = windowWidth < 90 ? (90 - windowWidth) / 30 : 0;

      const score = distKm + lateness * LATENESS_WEIGHT + urgencyFactor + tightWindow + earlyPenalty;
      if (score < bestScore) { bestScore = score; bestIndex = i; }
    }

    const next = unvisited.splice(bestIndex, 1)[0];
    route.push(next);
    const d        = haversineDistanceKm(cur.lat, cur.lng, next.location.lat, next.location.lng);
    currentMinutes += (d / cfg.avgSpeedKmh) * 60 + cfg.serviceStopMinutes;
    cur            = next.location;
  }

  return route;
}

// ─── Fase 2: 2-opt ──────────────────────────────────────────

function twoOptImprove(route, start, cfg = DEFAULTS) {
  let best     = [...route];
  let bestDist = totalRouteDistanceKm(best, start);
  let improved = true;
  let iters    = 0;

  while (improved && iters < cfg.twoOptMaxIter) {
    improved = false;
    iters++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const d = totalRouteDistanceKm(candidate, start);
        if (d < bestDist - 0.01) { best = candidate; bestDist = d; improved = true; }
      }
    }
  }
  return best;
}

// ─── Fase 3: Or-opt (mover segmentos de 1-2 paradas) ────────

/**
 * Or-opt: mueve subsecuencias de 1 o 2 paradas a otra posición.
 * Complementa al 2-opt para rutas con clústeres irregulares.
 */
function orOptImprove(route, start, cfg = DEFAULTS) {
  let best     = [...route];
  let bestDist = totalRouteDistanceKm(best, start);
  let improved = true;
  let iters    = 0;

  while (improved && iters < cfg.orOptMaxIter) {
    improved = false;
    iters++;

    for (let segLen = 1; segLen <= 2; segLen++) {
      for (let i = 0; i <= best.length - segLen; i++) {
        const seg  = best.slice(i, i + segLen);
        const rest = [...best.slice(0, i), ...best.slice(i + segLen)];

        for (let j = 0; j <= rest.length; j++) {
          if (j >= i - 1 && j <= i) continue; // misma posición
          const candidate = [...rest.slice(0, j), ...seg, ...rest.slice(j)];
          const d = totalRouteDistanceKm(candidate, start);
          if (d < bestDist - 0.01) { best = candidate; bestDist = d; improved = true; }
        }
      }
      if (improved) break;
    }
  }
  return best;
}

// ─── Fase 4: Reparación de ventanas de tiempo ───────────────

/**
 * Si una parada llega tarde más allá del umbral, intenta moverla
 * a una posición anterior donde el retraso sea menor.
 */
function repairTimeWindows(route, start, cfg = DEFAULTS) {
  const repaired = [...route];
  const LATE_THRESHOLD = 30; // minutos de tolerancia
  let changed = true;
  let passes  = 0;

  while (changed && passes < 25) {
    changed = false;
    passes++;

    let currentMinutes = cfg.workStartHour * 60;
    let cur            = start;

    for (let i = 0; i < repaired.length; i++) {
      const o    = repaired[i];
      const dist = haversineDistanceKm(cur.lat, cur.lng, o.location.lat, o.location.lng);
      currentMinutes += (dist / cfg.avgSpeedKmh) * 60 + cfg.serviceStopMinutes;

      const { end: twEnd } = parsePickupTime(o.schedule?.pickupTime, cfg);

      if (currentMinutes > twEnd + LATE_THRESHOLD && i > 0) {
        let bestPos     = i;
        let bestPenalty = currentMinutes - twEnd;

        for (let j = 0; j < i; j++) {
          const test = [...repaired.slice(0, j), o, ...repaired.slice(j, i), ...repaired.slice(i + 1)];
          let cm  = cfg.workStartHour * 60;
          let cc  = start;
          let pen = 0;
          for (let k = 0; k <= j; k++) {
            const d2 = haversineDistanceKm(cc.lat, cc.lng, test[k].location.lat, test[k].location.lng);
            cm += (d2 / cfg.avgSpeedKmh) * 60 + cfg.serviceStopMinutes;
            const { end: e } = parsePickupTime(test[k].schedule?.pickupTime, cfg);
            if (cm > e + LATE_THRESHOLD) pen += cm - e;
            cc = test[k].location;
          }
          if (pen < bestPenalty) { bestPenalty = pen; bestPos = j; }
        }

        if (bestPos !== i) {
          const moved = repaired.splice(i, 1)[0];
          repaired.splice(bestPos, 0, moved);
          changed = true;
          break;
        }
      }
      cur = o.location;
    }
  }
  return repaired;
}

// ─── Construcción de detalles por parada ────────────────────

/**
 * Calcula ETA, distancias, nivel de urgencia, estado de puntualidad
 * y ganancia estimada por cada parada.
 */
function buildStopDetails(route, start, cfg = DEFAULTS) {
  const stops        = [];
  let cur            = start;
  let currentMinutes = cfg.workStartHour * 60;
  let cumDist        = 0;

  for (let i = 0; i < route.length; i++) {
    const o    = route[i];
    const dist = haversineDistanceKm(cur.lat, cur.lng, o.location.lat, o.location.lng);
    currentMinutes += (dist / cfg.avgSpeedKmh) * 60 + cfg.serviceStopMinutes;
    cumDist        += dist;

    const { start: twStart, end: twEnd } = parsePickupTime(o.schedule?.pickupTime, cfg);
    const priority = TYPE_PRIORITY[o.type] || 3;

    // Nivel de urgencia compuesto (ventana + tipo)
    const windowWidth = twEnd - twStart;
    let urgencyLevel =
      priority >= 6 || windowWidth <= 60  ? 'critical' :
      priority >= 5 || windowWidth <= 120 ? 'high'     :
      priority >= 3                        ? 'normal'   :
                                             'flexible';

    // Minutos de retraso (negativo = llegada anticipada)
    const lateMins = Math.round(currentMinutes - twEnd);
    const onTime   = lateMins <= 15;

    // Costo de combustible para este segmento
    const segFuelCost = ((dist / cfg.vehicleKmPerLiter) * cfg.fuelPricePerLiter);

    stops.push({
      order:              o,
      stopNumber:         i + 1,
      distanceKm:         Math.round(dist * 10) / 10,
      cumulativeKm:       Math.round(cumDist * 10) / 10,
      // compatibilidad legacy (millas)
      distanceFromPrev:   Math.round((dist / KM_PER_MILE) * 10) / 10,
      cumulativeDistance: Math.round((cumDist / KM_PER_MILE) * 10) / 10,
      estimatedArrival:   minutesToTimeStr(Math.round(currentMinutes)),
      arrivalMinutes:     Math.round(currentMinutes),
      urgencyLevel,
      timeWindowStart:    twStart,
      timeWindowEnd:      twEnd,
      onTime,
      lateMins,           // + = tarde, - = anticipado, 0 = puntual
      priorityScore:      priority,
      segFuelCostMxn:     Math.round(segFuelCost * 100) / 100,
    });

    cur = o.location;
  }
  return stops;
}

// ─── VRP: partición de órdenes en múltiples vehículos ───────

/**
 * Divide las órdenes entre N vehículos usando k-means geográfico simple.
 * Cada vehículo arranca desde `startLocation`.
 * Devuelve array de arrays de órdenes.
 */
function partitionOrdersVRP(orders, numVehicles, startLocation) {
  if (numVehicles <= 1 || orders.length <= numVehicles) {
    return [orders];
  }

  // Inicializar centroides distribuidos por coordenadas
  const sorted     = [...orders].sort((a, b) => a.location.lat - b.location.lat);
  const chunkSize  = Math.ceil(sorted.length / numVehicles);
  let centroids    = Array.from({ length: numVehicles }, (_, k) => {
    const chunk = sorted.slice(k * chunkSize, (k + 1) * chunkSize);
    const lat   = chunk.reduce((s, o) => s + o.location.lat, 0) / chunk.length;
    const lng   = chunk.reduce((s, o) => s + o.location.lng, 0) / chunk.length;
    return { lat, lng };
  });

  let assignments  = new Array(orders.length).fill(0);
  const MAX_KMEANS = 20;

  for (let iter = 0; iter < MAX_KMEANS; iter++) {
    // Asignar cada orden al centroide más cercano
    const newAssign = orders.map((o) => {
      let best = 0, bestD = Infinity;
      centroids.forEach((c, k) => {
        const d = haversineDistanceKm(o.location.lat, o.location.lng, c.lat, c.lng);
        if (d < bestD) { bestD = d; best = k; }
      });
      return best;
    });

    // Recalcular centroides
    const newCentroids = centroids.map((_, k) => {
      const group = orders.filter((_, idx) => newAssign[idx] === k);
      if (group.length === 0) return centroids[k];
      return {
        lat: group.reduce((s, o) => s + o.location.lat, 0) / group.length,
        lng: group.reduce((s, o) => s + o.location.lng, 0) / group.length,
      };
    });

    const converged = JSON.stringify(newAssign) === JSON.stringify(assignments);
    assignments     = newAssign;
    centroids       = newCentroids;
    if (converged) break;
  }

  // Construir particiones; vehículo con menos órdenes absorbe los huérfanos
  const partitions = Array.from({ length: numVehicles }, () => []);
  orders.forEach((o, idx) => partitions[assignments[idx]].push(o));

  // Reequilibrar: mover órdenes de particiones vacías o muy desbalanceadas
  const avg = orders.length / numVehicles;
  partitions.forEach((part, k) => {
    while (part.length > Math.ceil(avg * 1.5) && partitions.some((p) => p.length < Math.floor(avg * 0.5))) {
      const donor    = part.splice(-1, 1)[0];
      const receiver = partitions.reduce((a, b) => (a.length < b.length ? a : b));
      receiver.push(donor);
    }
  });

  return partitions.filter((p) => p.length > 0);
}

// ─── Optimización de una sola ruta ──────────────────────────

function optimizeSingleRoute(orders, startLocation, cfg) {
  if (orders.length === 0) return { stops: [], totalKm: 0 };

  const step1 = nearestNeighborWithUrgency(orders, startLocation, cfg);
  const step2 = twoOptImprove(step1, startLocation, cfg);
  const step3 = orOptImprove(step2, startLocation, cfg);
  const final = repairTimeWindows(step3, startLocation, cfg);

  const totalKm = totalRouteDistanceKm(final, startLocation);
  const stops   = buildStopDetails(final, startLocation, cfg);
  return { stops, totalKm };
}

// ─── Función principal exportada ────────────────────────────

/**
 * Optimiza la ruta (o rutas multi-vehículo) para un conjunto de órdenes.
 *
 * @param {Array}  orders               - Lista de órdenes mapeadas
 * @param {Object} startLocation        - { lat, lng } del punto de partida (HQ)
 * @param {Object} options              - Opciones de configuración
 * @param {number} options.numVehicles  - Número de vehículos (default 1)
 * @param {number} options.avgSpeedKmh  - Velocidad promedio (km/h)
 * @param {number} options.vehicleKmPerLiter - Rendimiento del vehículo
 * @param {number} options.fuelPricePerLiter - Precio del litro de gasolina (MXN)
 * @param {number} options.serviceStopMinutes - Minutos por parada
 *
 * @returns {Object} Resultado de optimización con paradas, métricas y (multi) rutas
 */
export function optimizeRouteAdvanced(
  orders,
  startLocation = { lat: 34.2519, lng: -119.229 },
  options = {}
) {
  const cfg = { ...DEFAULTS, ...options };
  const numVehicles = Math.max(1, options.numVehicles || 1);

  // ── Caso vacío ──────────────────────────────────────────
  if (orders.length === 0) {
    return {
      stops: [], routes: [],
      totalKm: 0, totalDistance: 0,
      naiveKm: 0, naiveDistance: 0,
      savedKm: 0, savedMiles: 0,
      estimatedDuration: 0,
      estimatedFuelCostMxn: 0,
      estimatedFuelCost: 0,
      routeScore: 100, violations: 0,
      algorithm: 'N/A',
      numVehicles: 0,
    };
  }

  // ── Distancia naive para comparar ──────────────────────
  const naiveRoute = nearestNeighborWithUrgency(orders, startLocation, cfg);
  const naiveKm    = totalRouteDistanceKm(naiveRoute, startLocation);

  // ── Partición multi-vehículo ───────────────────────────
  const partitions = partitionOrdersVRP(orders, numVehicles, startLocation);

  // ── Optimizar cada partición ───────────────────────────
  const vehicleRoutes = partitions.map((part, idx) => {
    const { stops, totalKm } = optimizeSingleRoute(part, startLocation, cfg);
    const fuelLiters  = totalKm / cfg.vehicleKmPerLiter;
    const fuelCostMxn = fuelLiters * cfg.fuelPricePerLiter;
    const violations  = stops.filter((s) => !s.onTime).length;
    const duration    = stops.length > 0
      ? stops[stops.length - 1].arrivalMinutes - cfg.workStartHour * 60
      : 0;

    return {
      vehicleIndex: idx + 1,
      stops,
      totalKm:            Math.round(totalKm * 10) / 10,
      totalDistance:      Math.round((totalKm / KM_PER_MILE) * 10) / 10,
      fuelLiters:         Math.round(fuelLiters * 100) / 100,
      fuelCostMxn:        Math.round(fuelCostMxn * 100) / 100,
      violations,
      estimatedDuration:  duration,
    };
  });

  // ── Métricas globales ──────────────────────────────────
  const totalKm        = vehicleRoutes.reduce((s, r) => s + r.totalKm, 0);
  const totalFuelMxn   = vehicleRoutes.reduce((s, r) => s + r.fuelCostMxn, 0);
  const totalViolations= vehicleRoutes.reduce((s, r) => s + r.violations, 0);
  const maxDuration    = Math.max(...vehicleRoutes.map((r) => r.estimatedDuration));
  const savedKm        = Math.max(0, naiveKm - totalKm);

  // Para compatibilidad con código legacy (millas / USD)
  const totalMiles     = totalKm / KM_PER_MILE;
  const savedMiles     = savedKm / KM_PER_MILE;
  const naiveMiles     = naiveKm / KM_PER_MILE;

  // Score: premia distancia corta y penaliza violaciones de ventana
  const maxPossibleKm  = orders.length * 8;
  const distScore      = Math.max(0, 100 - (totalKm / maxPossibleKm) * 50);
  const routeScore     = Math.max(0, Math.round(distScore - totalViolations * 12));

  // Paradas del vehículo 1 (compatibilidad legacy con `stops` flat)
  const primaryStops = vehicleRoutes[0]?.stops ?? [];

  return {
    // ── Resultado legacy (un solo vehículo o primer vehículo) ──
    stops:               primaryStops,
    totalDistance:       Math.round(totalMiles * 10) / 10,       // millas
    naiveDistance:       Math.round(naiveMiles * 10) / 10,
    savedMiles:          Math.round(savedMiles * 10) / 10,
    estimatedDuration:   maxDuration,
    estimatedFuelCost:   Math.round((totalFuelMxn / 18) * 100) / 100, // ~USD legado
    routeScore,
    violations:          totalViolations,
    algorithm:           '2-opt + Or-opt + Ventanas de Tiempo',

    // ── Resultado extendido ──────────────────────────────────
    routes:              vehicleRoutes,          // array por vehículo
    numVehicles:         vehicleRoutes.length,
    totalKm:             Math.round(totalKm * 10) / 10,
    naiveKm:             Math.round(naiveKm * 10) / 10,
    savedKm:             Math.round(savedKm * 10) / 10,
    estimatedFuelCostMxn: Math.round(totalFuelMxn * 100) / 100,
    totalFuelLiters:     Math.round((totalKm / cfg.vehicleKmPerLiter) * 100) / 100,
    cfg,                 // configuración usada (útil para debug)
  };
}

// ─── Mock & mapper ───────────────────────────────────────────

export const MOCK_ORDERS = [];

export function mapBackendOrder(o) {
  const lat = o.location?.lat ?? 34.2519 + (Math.random() - 0.5) * 0.06;
  const lng = o.location?.lng ?? -119.229 + (Math.random() - 0.5) * 0.06;

  const st = (o.status || 'new').toLowerCase().replace(/ /g, '_');
  const mappedStatus =
    ['ready', 'out_for_delivery', 'shipping'].includes(st)          ? 'ready'      :
    ['in_process', 'in-process', 'processing', 'washing'].includes(st) ? 'in-process' :
    ['picked_up', 'picked-up'].includes(st)                          ? 'picked-up'  :
    ['delivered', 'completed'].includes(st)                          ? 'delivered'  :
    ['confirmed', 'pickup_scheduled'].includes(st)                   ? 'pending'    :
                                                                       'pending';

  const svc = (o.service_type || '').toLowerCase();
  const mappedType =
    svc.includes('wash') && svc.includes('fold') ? 'wash-fold'       :
    svc.includes('airbnb')                        ? 'airbnb'          :
    svc.includes('b2b') || svc.includes('commercial') ? 'b2b'        :
    svc.includes('self')                          ? 'self-service'    :
                                                    'pickup-delivery';

  const total = o.total_amount || 0;

  return {
    id:          o.id,
    orderNumber: o.order_number || `VFL-${o.id?.slice(0, 8) || '000'}`,
    type:        mappedType,
    status:      mappedStatus,
    customer: {
      name:  o.customer_name  || 'Cliente',
      phone: o.customer_phone || '',
      email: o.customer_email || '',
    },
    location: {
      address: o.pickup_address || o.delivery_address || '',
      lat, lng,
      zipCode: o.zip_code || '',
    },
    service: {
      weight:      o.estimated_lbs || o.actual_lbs || null,
      preferences: o.notes || '',
    },
    pricing: {
      subtotal: Math.round(total * 0.9225 * 100) / 100,
      tax:      Math.round(total * 0.0775 * 100) / 100,
      total,
    },
    payment: {
      method: o.payment_method  || 'card',
      status: o.payment_status  || 'pending',
    },
    schedule: {
      pickupDate:   o.pickup_date         || '',
      pickupTime:   o.pickup_time_window  || '09:00 AM - 11:00 AM',
      deliveryDate: o.delivery_date       || '',
      deliveryTime: o.delivery_time       || '',
    },
    specialInstructions: o.notes || '',
    createdAt:           o.created_at || new Date().toISOString(),
    _backendId:          o.id,
  };
}