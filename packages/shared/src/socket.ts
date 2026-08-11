import type { GameConfig, RoomPublicState } from "./model.js";

export type Ack<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

export type Acknowledge<T = undefined> = (result: Ack<T>) => void;

export interface ClientToServerEvents {
  "room:create": (name: string, acknowledge: Acknowledge<{ code: string }>) => void;
  "room:join": (
    payload: { code: string; name: string },
    acknowledge: Acknowledge<{ code: string }>,
  ) => void;
  "config:set": (config: GameConfig, acknowledge: Acknowledge) => void;
  "game:start": (acknowledge: Acknowledge) => void;
  "host:countdown": (acknowledge: Acknowledge) => void;
  "host:continue": (acknowledge: Acknowledge) => void;
  "vote:cast": (yes: boolean, acknowledge: Acknowledge) => void;
  "host:resolve": (correct: boolean, acknowledge: Acknowledge) => void;
  "playback:recalibrate": (deltaMs: number, acknowledge: Acknowledge) => void;
}

export interface ServerToClientEvents {
  state: (state: RoomPublicState) => void;
  error: (message: string) => void;
}

export type InterServerEvents = Record<string, never>;
export interface SocketData {
  roomCode?: string;
}
