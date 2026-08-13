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
  /** Setlist de la noche (P5): restringe el sorteo a estos ids; `null` = sin restricción. */
  setSetlist: (songIds: string[] | null) => void;
  setHostHasAudio: (ready: boolean) => void;
  start: () => void;
  startCountdown: () => void;
  /**
   * El host llama esto justo después de que `audio.play()` resuelve (P5).
   * Único punto donde el motor fija `startedAt`; no lanza si ya se llamó o
   * si la sala no está esperando confirmación (ver `RoomManager`).
   */
  hostConfirmPlaybackStarted: (audioPositionSeconds: number) => void;
  /** Reporte periódico del playhead real del host durante `playing` (P5). No lanza. */
  reportPlayhead: (audioPositionSeconds: number) => void;
  continueRound: () => void;
  /** «Una más» (P5): alarga la noche una ronda y prepara la siguiente. */
  extendRound: () => void;
  /** «Terminar show» (P5): cierra el show ya mismo. */
  finishShow: () => void;
  resolveManually: (correct: boolean) => void;
  recalibrate: (deltaMs: number) => void;
  /** Fin de interpretación en modo karaoke (P5): pasa de `playing` a `voting`. */
  endKaraokeTurn: () => void;
  /** El host cierra la votación de estrellas ya mismo (P5). */
  closeKaraokeVoting: () => void;
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
          if (command.type === "vote" || command.type === "voteStars") {
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
        } else if (command.type === "voteStars") {
          manager.voteStars(code, command.playerId, command.stars);
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
    setSetlist: (songIds) => guarded(() => manager.setSetlist(code, hostId, songIds)),
    setHostHasAudio: (ready) => guarded(() => manager.setHostHasAudio(code, hostId, ready)),
    start: () => guarded(() => manager.start(code, hostId)),
    startCountdown: () => guarded(() => manager.startCountdown(code, hostId)),
    hostConfirmPlaybackStarted: (audioPositionSeconds) =>
      manager.hostConfirmPlaybackStarted(code, hostId, audioPositionSeconds),
    reportPlayhead: (audioPositionSeconds) => manager.reportPlayhead(code, hostId, audioPositionSeconds),
    continueRound: () => guarded(() => manager.continue(code, hostId)),
    extendRound: () => guarded(() => manager.extendRound(code, hostId)),
    finishShow: () => guarded(() => manager.finishShow(code, hostId)),
    resolveManually: (correct) => guarded(() => manager.resolveManually(code, hostId, correct)),
    recalibrate: (deltaMs) => guarded(() => manager.recalibrate(code, hostId, deltaMs)),
    endKaraokeTurn: () => guarded(() => manager.endKaraokeTurn(code, hostId)),
    closeKaraokeVoting: () => guarded(() => manager.closeKaraokeVoting(code, hostId)),
    destroy: () => {
      manager.disconnect(code, hostId);
    },
  };
}
