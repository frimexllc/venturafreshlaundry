const KEY = 'vfl-route-history';

export function loadRouteHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveRouteRecord(record) {
  try {
    const history = loadRouteHistory();
    const entry = { ...record, id: Date.now().toString(36) + Math.random().toString(36).slice(2), completedAt: Date.now() };
    const updated = [entry, ...history].slice(0, 30);
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch { /* storage unavailable */ }
}
