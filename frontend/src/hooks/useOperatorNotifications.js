import { useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export function useOperatorNotifications(enabled = true) {
  const socketRef = useRef(null);
  const permRef = useRef(false);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") {
      permRef.current = true;
      return true;
    }
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    permRef.current = result === "granted";
    return permRef.current;
  }, []);

  const registerSW = useCallback(async () => {
    if ("serviceWorker" in navigator) {
      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch (e) {
        console.warn("SW registration failed:", e);
      }
    }
  }, []);

  const showNotification = useCallback((title, body, url) => {
    if (!permRef.current && Notification.permission !== "granted") return;
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: "/android-chrome-192x192.png",
          badge: "/android-chrome-192x192.png",
          vibrate: [200, 100, 200],
          tag: `order-${Date.now()}`,
          data: { url: url || "/admin/operator" },
        });
      });
    } else {
      new Notification(title, { body, icon: "/android-chrome-192x192.png" });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    registerSW();
    requestPermission();

    const socket = io(API_URL, { transports: ["websocket", "polling"], reconnection: true });
    socketRef.current = socket;

    socket.on("notification", (data) => {
      if (data?.type === "order_created") {
        const orderNum = data.order_number || data.payload?.order_number || "";
        const customerName = data.customer_name || data.payload?.customer_name || "Cliente";
        showNotification(
          "Nueva Orden Recibida",
          `Orden ${orderNum} de ${customerName}`,
          "/admin/operator"
        );
      }
      if (data?.type === "order_status") {
        showNotification(
          "Orden Actualizada",
          `Orden ${data.order_id || ""} → ${data.status || ""}`,
          "/admin/operator"
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [enabled, registerSW, requestPermission, showNotification]);

  return { requestPermission };
}
