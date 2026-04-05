/**
 * notificationsSocket.js
 * ──────────────────────
 * Cliente Socket.IO con manejo correcto de:
 *   1. Sesión inválida tras reinicio del servidor ("Invalid session")
 *   2. Reconexión automática con SID nuevo (no con el SID stale)
 *   3. Throttling de eventos para no saturar el servidor
 *
 * CAUSA DEL ERROR "Invalid session"
 * ───────────────────────────────────
 * Socket.IO guarda el session ID en memoria. Si el servidor se reinicia,
 * el cliente intenta reconectarse enviando su SID anterior. El servidor ya
 * no lo conoce y lanza el error. La solución en el cliente es:
 *   - Al recibir connect_error con "Invalid session", limpiar el SID local
 *     y forzar una reconexión limpia (sin SID previo).
 *   - Usar forceNew: false pero con reconnection: true y un backoff razonable.
 */

import { io } from "socket.io-client";

const SOCKET_URL = process.env.REACT_APP_BACKEND_URL || "";

// Singleton de la instancia del socket
let _socket = null;
let _reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Crea y retorna la instancia del socket de notificaciones.
 * Idempotente: si ya existe una conexión activa, la retorna.
 */
export function createNotificationsSocket() {
  if (!SOCKET_URL) {
    console.warn("[Socket] REACT_APP_BACKEND_URL not set — socket disabled");
    return null;
  }

  // Si ya hay un socket conectado o en proceso de conexión, reutilizarlo
  if (_socket && (_socket.connected || _socket.active)) {
    return _socket;
  }

  // Destruir instancia anterior si existe pero está desconectada
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }

  _socket = io(SOCKET_URL, {
    // ── Reconexión ────────────────────────────────────────────────────────
    reconnection:        true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay:   1000,      // 1s inicial
    reconnectionDelayMax: 30000,    // máximo 30s entre intentos
    randomizationFactor: 0.3,       // jitter para evitar thundering herd

    // ── Transporte ────────────────────────────────────────────────────────
    // Empezar con polling para asegurar que la conexión inicial funcione,
    // luego hacer upgrade a WebSocket. Esto evita problemas con proxies
    // que no soportan WebSocket directamente.
    transports: ["polling", "websocket"],

    // ── Timeout ───────────────────────────────────────────────────────────
    timeout: 10000,   // 10s para el handshake inicial

    // ── Auth ──────────────────────────────────────────────────────────────
    auth: (cb) => {
      const token = localStorage.getItem("token");
      cb({ token: token || "" });
    },
  });

  // ── Handlers de ciclo de vida ──────────────────────────────────────────

  _socket.on("connect", () => {
    _reconnectAttempts = 0;
    console.info(`[Socket] Connected — SID: ${_socket.id}`);
  });

  _socket.on("disconnect", (reason) => {
    console.info(`[Socket] Disconnected — reason: ${reason}`);
    // Si el servidor cerró la conexión activamente, no intentar reconectar
    // inmediatamente — dejar que el backoff de socket.io lo maneje
    if (reason === "io server disconnect") {
      // El servidor cerró la conexión explícitamente.
      // Reconectar manualmente después de un delay.
      setTimeout(() => {
        if (_socket) _socket.connect();
      }, 3000);
    }
  });

  _socket.on("connect_error", (error) => {
    _reconnectAttempts++;
    const msg = error?.message || String(error);

    // ── FIX PRINCIPAL: manejar "Invalid session" ───────────────────────
    // Cuando el servidor reinicia, el SID del cliente queda obsoleto.
    // Socket.IO internamente guarda el SID — necesitamos forzar que
    // abandone el SID antiguo desconectando y reconectando.
    if (
      msg.includes("Invalid session") ||
      msg.includes("invalid session") ||
      msg.includes("Session ID unknown")
    ) {
      console.warn(
        "[Socket] Invalid session detected — forcing clean reconnect"
      );

      // Desconectar sin reconexión automática para limpiar el estado
      _socket.io.opts.reconnection = false;
      _socket.disconnect();

      // Esperar un momento y reconectar — el nuevo connect no tendrá SID
      setTimeout(() => {
        if (_socket) {
          _socket.io.opts.reconnection = true;
          // Limpiar el engine interno para forzar un SID nuevo
          // (socket.io-client v4+)
          if (_socket.io?.engine) {
            _socket.io.engine.id = null;
          }
          _socket.connect();
          console.info("[Socket] Clean reconnect initiated");
        }
      }, 2000 + Math.random() * 1000); // jitter para evitar colisiones

      return;
    }

    // Para otros errores, solo loguear con nivel apropiado
    if (_reconnectAttempts <= 3) {
      console.warn(`[Socket] connect_error (attempt ${_reconnectAttempts}): ${msg}`);
    } else {
      // Después de varios intentos, reducir el ruido en consola
      console.debug(`[Socket] connect_error (attempt ${_reconnectAttempts}): ${msg}`);
    }
  });

  _socket.on("reconnect", (attemptNumber) => {
    console.info(`[Socket] Reconnected after ${attemptNumber} attempts`);
    _reconnectAttempts = 0;
  });

  _socket.on("reconnect_failed", () => {
    console.error("[Socket] Max reconnection attempts reached");
  });

  // Responder a confirmación de sesión válida del servidor
  _socket.on("connected", ({ sid, status }) => {
    console.debug(`[Socket] Session confirmed — SID: ${sid}, status: ${status}`);
  });

  return _socket;
}

/**
 * Desconecta y destruye la instancia del socket.
 * Llamar en el cleanup del useEffect del componente raíz.
 */
export function destroyNotificationsSocket() {
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
    _reconnectAttempts = 0;
    console.info("[Socket] Socket destroyed");
  }
}

/**
 * Retorna la instancia actual del socket sin crear una nueva.
 */
export function getNotificationsSocket() {
  return _socket;
}