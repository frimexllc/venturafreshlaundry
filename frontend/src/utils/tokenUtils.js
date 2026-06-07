const ADMIN_TOKEN_KEY = "token";
const ADMIN_USER_KEY = "user";
const CUSTOMER_TOKEN_KEY = "customer_token";

// ── Admin token ───────────────────────────────────────────────────────
export const getAdminToken = () =>
  localStorage.getItem(ADMIN_TOKEN_KEY) ||
  sessionStorage.getItem(ADMIN_TOKEN_KEY);

export const setAdminToken = (token, user, remember = true) => {
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(ADMIN_TOKEN_KEY, token);
  if (user) storage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
};

export const clearAdminSession = () => {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_USER_KEY);
};

export const getAdminUser = () => {
  try {
    const raw =
      localStorage.getItem(ADMIN_USER_KEY) ||
      sessionStorage.getItem(ADMIN_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// ── Customer token ────────────────────────────────────────────────────
export const getCustomerToken = () =>
  localStorage.getItem(CUSTOMER_TOKEN_KEY) ||
  sessionStorage.getItem(CUSTOMER_TOKEN_KEY);

export const setCustomerToken = (token, remember = true) => {
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(CUSTOMER_TOKEN_KEY, token);
};

export const clearCustomerSession = () => {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
};

// ── Helper: token realmente expirado o inválido (no solo ausente) ──────
export const isTokenError = (detail = "") => {
  const d = detail.toLowerCase();
  return (
    d.includes("token expired") ||
    d.includes("expired") ||
    d.includes("invalid token") ||
    d.includes("signature") ||
    d.includes("user not found")
  );
};