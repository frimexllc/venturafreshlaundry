/**
 * Date/time utilities — America/Los_Angeles (Ventura, CA)
 */
const TZ = "America/Los_Angeles";

/** Format ISO string to Pacific display: "Mar 28, 2026 6:30 PM PT" */
export function formatDatePT(isoStr, opts = {}) {
  if (!isoStr) return "--";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const options = {
      timeZone: TZ,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...opts,
    };
    return d.toLocaleString("en-US", options) + " PT";
  } catch {
    return isoStr;
  }
}

/** Format ISO string to short date: "03/28/2026" */
export function formatShortDatePT(isoStr) {
  if (!isoStr) return "--";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString("en-US", { timeZone: TZ, month: "2-digit", day: "2-digit", year: "numeric" });
  } catch {
    return isoStr;
  }
}

/** Format ISO string to time only: "6:30 PM" */
export function formatTimePT(isoStr) {
  if (!isoStr) return "--";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return isoStr;
  }
}

/** Format relative time: "2 hours ago" / "hace 2 horas" */
export function formatRelative(isoStr, locale = "en") {
  if (!isoStr) return "--";
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (locale === "es") {
      if (diffMin < 1) return "ahora";
      if (diffMin < 60) return `hace ${diffMin} min`;
      if (diffHr < 24) return `hace ${diffHr}h`;
      if (diffDay < 7) return `hace ${diffDay}d`;
      return formatShortDatePT(isoStr);
    }
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return formatShortDatePT(isoStr);
  } catch {
    return isoStr;
  }
}

/** Get current Pacific time as ISO string */
export function nowPacific() {
  return new Date().toLocaleString("sv-SE", { timeZone: TZ }).replace(" ", "T");
}

export const TIMEZONE_LABEL = "Pacific Time (PT)";
export const TIMEZONE_ID = TZ;
