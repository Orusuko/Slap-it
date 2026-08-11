import { RoomManager, type GameConfig, type RoomPublicState, type Song } from "@slay-it/shared";
import type { RoomAck, RoomCommand } from "../realtime/protocol";

export interface HostEngine {
  readonly state: RoomPublicState;
  handleRemoteCommand: (
    command: RoomCommand,
    meta?: { presenceKeys?: Set<string> },
  ) => RoomAck;
  removePlayer: (playerId: string) => void;
  configure: (config: GameConfig) => void;
  selectSongChoice: (songId: string | null) => void;
  /** Hace elegibles canciones subidas por jugadores (IndexedDB del host). */
  registerSongs: (songs: Song[]) => void;
  setHostHasAudio: (ready: boolean) => void;
  start: () => void;
  startCountdown: () => void;
  continueRound: () => void;
  resolveManually: (correct: boolean) => void;
  recalibrate: (deltaMs: number) => void;
  destroy: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado";
}

/**
 * Envuelve `RoomManager` para el navegador del anfitrión.
 * Valida que `playerId` del comando coincida con una clave de Presence
 * observada (mitiga spoof básico en el canal).
 */
export function createHostEngine(
  hostId: string,
  onState: (state: RoomPublicState) => void,
): HostEngine {
  const manager = new RoomManager((_code, state) => onState(state));
  const { code } = manager.create(hostId, "Anfitrión");

  const guarded = (action: () => void): void => {
    try {
      action();
    } catch (error) {
      throw new Error(errorMessage(error), { cause: error });
    }
  };

  return {
    get state() {
      return manager.get(code)!;
    },
    handleRemoteCommand: (command, meta) => {
      try {
        const keys = meta?.presenceKeys;
        if (keys && keys.size > 0 && !keys.has(command.playerId)) {
          // Join puede llegar un instante antes del sync de Presence: se tolera
          // solo en join; el voto exige presencia visible.
          if (command.type === "vote") {
            return {
              requestId: command.requestId,
              ok: false,
              error: "No se pudo verificar tu presencia en la sala",
            };
          }
        }
        if (command.type === "join") {
          manager.join(code, command.playerId, command.name);
        } else if (command.type === "vote") {
          manager.vote(code, command.playerId, command.yes);
        }
        return { requestId: command.requestId, ok: true };
      } catch (error) {
        return { requestId: command.requestId, ok: false, error: errorMessage(error) };
      }
    },
    removePlayer: (playerId) => {
      manager.disconnect(code, playerId);
    },
    configure: (config) => guarded(() => manager.configure(code, hostId, config)),
    selectSongChoice: (songId) => guarded(() => manager.selectSongChoice(code, hostId, songId)),
    registerSongs: (songs) => manager.registerSongs(songs),
    setHostHasAudio: (ready) => guarded(() => manager.setHostHasAudio(code, hostId, ready)),
    start: () => guarded(() => manager.start(code, hostId)),
    startCountdown: () => guarded(() => manager.startCountdown(code, hostId)),
    continueRound: () => guarded(() => manager.continue(code, hostId)),
    resolveManually: (correct) => guarded(() => manager.resolveManually(code, hostId, correct)),
    recalibrate: (deltaMs) => guarded(() => manager.recalibrate(code, hostId, deltaMs)),
    destroy: () => {
      manager.disconnect(code, hostId);
    },
  };
}
