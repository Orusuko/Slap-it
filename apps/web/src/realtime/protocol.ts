const CHANNEL_PREFIX = "slay-it-room";

export const COMMAND_EVENT = "command";
export const ACK_EVENT = "ack";
export const STATE_EVENT = "state";
export const HOST_PRESENCE_KEY = "host";

/**
 * Únicos comandos que un jugador (no anfitrión) necesita enviar por el canal.
 * El resto de acciones (configurar, iniciar, recalibrar, etc.) las ejecuta el
 * propio anfitrión de forma local, sin ida y vuelta por la red.
 */
export type RoomCommand =
  | { type: "join"; requestId: string; playerId: string; name: string }
  | { type: "vote"; requestId: string; playerId: string; yes: boolean };

export type RoomAck =
  | { requestId: string; ok: true }
  | { requestId: string; ok: false; error: string };

/**
 * `crypto.randomUUID()` solo existe en contextos seguros (HTTPS o `localhost`).
 * Al abrir la app desde el teléfono por IP local (http://192.168.x.x), no está
 * disponible y lanzaba una excepción silenciosa que dejaba el botón girando
 * para siempre. Este generador funciona en cualquier contexto.
 */
export function createRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // Contexto no seguro: cae al generador manual de abajo.
    }
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createRequestId(): string {
  return createRandomId();
}

export function channelTopic(code: string): string {
  return `${CHANNEL_PREFIX}-${code}`;
}
