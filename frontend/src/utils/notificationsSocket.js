import { io } from "socket.io-client";

const normalizeBaseUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
};

const resolveNotificationsConfig = () => {
  const explicit = process.env.REACT_APP_NOTIFICATIONS_URL;
  if (explicit) {
    const explicitLower = explicit.toLowerCase();
    const explicitLooksBroken = explicitLower.includes(":3000/ws") || explicitLower.endsWith("/ws");
    if (!explicitLooksBroken) {
      const explicitBase = normalizeBaseUrl(explicit);
      if (explicitBase) {
        return { url: explicitBase, path: "/api/socket.io" };
      }
    }
  }

  const base = normalizeBaseUrl(process.env.REACT_APP_BACKEND_URL);
  if (!base) return null;
  return { url: base, path: "/api/socket.io" };
};

export const createNotificationsSocket = () => {
  const config = resolveNotificationsConfig();
  if (!config) {
    return null;
  }
  return io(config.url, {
    path: config.path,
    transports: ["polling"],
    upgrade: false,
    withCredentials: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000
  });
};
