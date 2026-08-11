/** Ventana antes de expulsar a un jugador tras un leave de Presence (bloqueo de pantalla, etc.). */
export const PRESENCE_GRACE_MS = 12_000;

export interface PresenceLeaveGuard {
  notifyLeave: (playerId: string) => void;
  notifyJoin: (playerId: string) => void;
  isPending: (playerId: string) => boolean;
  dispose: () => void;
}

/**
 * Retrasa la expulsión tras un `presence leave`. Si el mismo id vuelve a
 * aparecer (rejoin) dentro de la gracia, se cancela el kick.
 */
export function createPresenceLeaveGuard(
  onLeaveConfirmed: (playerId: string) => void,
  graceMs: number = PRESENCE_GRACE_MS,
): PresenceLeaveGuard {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    notifyLeave(playerId) {
      if (!playerId || pending.has(playerId)) return;
      const timer = setTimeout(() => {
        pending.delete(playerId);
        onLeaveConfirmed(playerId);
      }, graceMs);
      pending.set(playerId, timer);
    },
    notifyJoin(playerId) {
      const timer = pending.get(playerId);
      if (!timer) return;
      clearTimeout(timer);
      pending.delete(playerId);
    },
    isPending(playerId) {
      return pending.has(playerId);
    },
    dispose() {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    },
  };
}
