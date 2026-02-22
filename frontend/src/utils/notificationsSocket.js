import { io } from "socket.io-client";

const resolveNotificationsUrl = () => {
  const explicit = process.env.REACT_APP_NOTIFICATIONS_URL;
  if (explicit) return explicit;

  const base = process.env.REACT_APP_BACKEND_URL;
  if (!base) return null;

  try {
    const parsed = new URL(base);
    const protocol = parsed.protocol;
    const host = parsed.hostname;
    const port = process.env.REACT_APP_NOTIFICATIONS_PORT || "4001";
    return `${protocol}//${host}:${port}`;
  } catch (error) {
    return null;
  }
};

export const createNotificationsSocket = () => {
  const url = resolveNotificationsUrl();
  if (!url) {
    return null;
  }
  return io(url, {
    transports: ["websocket"],
    reconnectionAttempts: 3,
    timeout: 5000
  });
};
