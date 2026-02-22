import { io } from "socket.io-client";

const resolveNotificationsConfig = () => {
  const explicit = process.env.REACT_APP_NOTIFICATIONS_URL;
  if (explicit) {
    return { url: explicit, path: "/socket.io" };
  }

  const base = process.env.REACT_APP_BACKEND_URL;
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
    transports: ["websocket"],
    reconnectionAttempts: 3,
    timeout: 5000
  });
};
