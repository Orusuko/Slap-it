const STORAGE_KEY = "slay-it-player-session";

export interface PlayerSession {
  code: string;
  playerId: string;
  name: string;
}

export function readPlayerSession(): PlayerSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayerSession>;
    if (
      typeof parsed.code !== "string" ||
      parsed.code.length !== 4 ||
      typeof parsed.playerId !== "string" ||
      !parsed.playerId ||
      typeof parsed.name !== "string" ||
      !parsed.name.trim()
    ) {
      return null;
    }
    return { code: parsed.code.toUpperCase(), playerId: parsed.playerId, name: parsed.name.trim() };
  } catch {
    return null;
  }
}

export function writePlayerSession(session: PlayerSession): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        code: session.code.trim().toUpperCase(),
        playerId: session.playerId,
        name: session.name.trim(),
      }),
    );
  } catch {
    // localStorage lleno o bloqueado: el rejoin no es crítico.
  }
}

export function clearPlayerSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
