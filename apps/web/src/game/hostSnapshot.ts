import { z } from "zod";
import type { RoomPublicState, RoomSnapshot } from "@slay-it/shared";

export const HOST_SNAPSHOT_KEY = "slay-it-host-session";

const snapshotSchema = z.object({
  hostId: z.string().min(1),
  usedSongIds: z.array(z.string()),
  setlistSongIds: z.array(z.string()).nullable(),
  state: z
    .object({
      code: z.string().length(4),
      hostId: z.string().min(1),
      phase: z.enum([
        "lobby",
        "ready",
        "countdown",
        "playing",
        "reveal",
        "voting",
        "score",
        "finished",
      ]),
    })
    .passthrough(),
});

export type HostSnapshot = RoomSnapshot;

function sessionStore(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function readHostSnapshot(): HostSnapshot | null {
  const store = sessionStore();
  if (!store) return null;
  try {
    const raw = store.getItem(HOST_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = snapshotSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data as unknown as HostSnapshot;
  } catch {
    return null;
  }
}

export function writeHostSnapshot(snapshot: HostSnapshot): void {
  const store = sessionStore();
  if (!store) return;
  try {
    store.setItem(HOST_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // sessionStorage lleno o bloqueado: la recarga F5 no podrá restaurar.
  }
}

export function clearHostSnapshot(): void {
  try {
    sessionStore()?.removeItem(HOST_SNAPSHOT_KEY);
  } catch {
    // ignore
  }
}

export function snapshotFromState(
  hostId: string,
  usedSongIds: string[],
  setlistSongIds: string[] | null,
  state: RoomPublicState,
): HostSnapshot {
  return {
    hostId,
    usedSongIds,
    setlistSongIds,
    state,
  };
}
