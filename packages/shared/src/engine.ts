import { defaultGameConfig, gameConfigSchema, playerSchema } from "./model.js";
import type { BlackoutSelection, GameConfig, Player, RelayPlan, RoomPublicState, Song } from "./model.js";
import { demoSongs } from "./catalog.js";
import {
  getPlaybackPosition,
  isPlaceholderSong,
  selectBlackout,
  selectStartPosition,
  selectSong,
} from "./game.js";
import {
  getCurrentTurn,
  planRelay,
  reassignRelayFrom,
  relayStartPosition,
  resolveTurnTimes,
} from "./relay.js";
import { resolveMajority } from "./rules.js";

interface Room {
  state: RoomPublicState;
  usedSongIds: string[];
  timer?: ReturnType<typeof setTimeout>;
  turnTimers: ReturnType<typeof setTimeout>[];
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ACTIVE_RELAY_PHASES = new Set(["ready", "countdown", "playing"]);
const ACTIVE_ROUND_PHASES = new Set([
  "ready",
  "countdown",
  "playing",
  "reveal",
  "voting",
]);

function blackoutFromPlan(song: Song, plan: RelayPlan): {
  blackout: BlackoutSelection | null;
  singerId: string | null;
} {
  const blackoutTurn = plan.turns.find((turn) => turn.kind === "blackout") ?? plan.turns.at(-1) ?? null;
  if (!blackoutTurn) return { blackout: null, singerId: null };
  const blackoutSections = song.sections.filter((section) =>
    blackoutTurn.sectionIds.includes(section.id),
  );
  if (blackoutSections.length === 0) return { blackout: null, singerId: blackoutTurn.playerId };
  const blackoutLines = song.lines.filter((line) =>
    blackoutSections.some((section) => section.lineIds.includes(line.id)),
  );
  return {
    blackout: {
      sectionIds: blackoutTurn.sectionIds,
      lineIds: blackoutLines.map((line) => line.id),
      start: Math.min(...blackoutSections.map((section) => section.start)),
      end: Math.max(...blackoutSections.map((section) => section.end)),
    },
    singerId: blackoutTurn.playerId,
  };
}

/**
 * Máquina de estados autoritativa de una partida. Se ejecuta en Node (servidor
 * local opcional) o directamente en el navegador del anfitrión cuando se
 * publica en GitHub Pages sin servidor propio.
 *
 * En modo relevo:
 * - `activeTurnIndex` = turno vigente (UI de karaoke).
 * - `singerId` = quien canta el blackout (voto / +1), nunca se spoilea en ready.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /**
   * Canciones fuera de `demoSongs` (ej. subidas por un jugador con el wizard
   * "Sube tu canción" y guardadas en IndexedDB del navegador del host).
   * Se registran en runtime; no viven en este paquete.
   */
  private readonly externalSongs = new Map<string, Song>();

  constructor(private readonly emitState: (code: string, state: RoomPublicState) => void) {}

  /** Hace elegibles canciones externas al catálogo (no persiste nada aquí). */
  registerSongs(songs: Song[]): void {
    for (const song of songs) this.externalSongs.set(song.id, song);
  }

  private findSong(id: string): Song | undefined {
    return demoSongs.find((item) => item.id === id) ?? this.externalSongs.get(id);
  }

  create(hostId: string, _name: string): RoomPublicState {
    const code = this.createCode();
    const state: RoomPublicState = {
      code,
      hostId,
      players: [],
      config: { ...defaultGameConfig },
      phase: "lobby",
      song: null,
      blackout: null,
      singerId: null,
      activeTurnIndex: null,
      round: 0,
      totalRounds: 0,
      countdownEndsAt: null,
      startPosition: 0,
      startedAt: null,
      revealEndsAt: null,
      playbackOffsetMs: 0,
      votes: {},
      lastResult: null,
      relayPlan: null,
      endReason: null,
      hostHasAudio: false,
      hostNow: null,
      selectedSongId: null,
    };
    this.rooms.set(code, { state, usedSongIds: [], turnTimers: [] });
    return state;
  }

  join(codeInput: string, playerId: string, name: string): RoomPublicState {
    const room = this.requireRoom(codeInput);
    if (room.state.phase !== "lobby") throw new Error("La partida ya comenzó");
    if (room.state.players.length >= room.state.config.maxPlayers) {
      throw new Error("La sala está llena");
    }
    if (room.state.players.some((player) => player.id === playerId)) {
      throw new Error("Ya estás en esta sala");
    }
    room.state.players.push(this.makePlayer(playerId, name));
    this.publish(room);
    return room.state;
  }

  get(code: string): RoomPublicState | undefined {
    return this.rooms.get(code.toUpperCase())?.state;
  }

  configure(code: string, actorId: string, config: GameConfig): void {
    const room = this.requireHost(code, actorId);
    if (room.state.phase !== "lobby") throw new Error("Solo se configura desde el lobby");
    const parsed = gameConfigSchema.safeParse(config);
    if (!parsed.success) throw new Error("La configuración no es válida");
    if (parsed.data.maxPlayers < room.state.players.length) {
      throw new Error("El máximo no puede ser menor que los jugadores actuales");
    }
    room.state.config = parsed.data;
    this.publish(room);
  }

  /** Elige canción fija para la próxima ronda (`null` = sorteo). Solo en lobby. */
  selectSongChoice(code: string, actorId: string, songId: string | null): void {
    const room = this.requireHost(code, actorId);
    if (room.state.phase !== "lobby") throw new Error("Solo se elige canción desde el lobby");
    if (songId !== null) {
      const song = this.findSong(songId);
      if (!song) throw new Error("Esa canción no está en el catálogo");
      if (isPlaceholderSong(song)) {
        throw new Error("Los placeholders no se pueden elegir para la fiesta");
      }
    }
    room.state.selectedSongId = songId;
    this.publish(room);
  }

  setHostHasAudio(code: string, actorId: string, ready: boolean): void {
    const room = this.requireHost(code, actorId);
    if (room.state.hostHasAudio === ready) return;
    room.state.hostHasAudio = ready;
    this.publish(room);
  }

  start(code: string, actorId: string): void {
    const room = this.requireHost(code, actorId);
    if (room.state.phase !== "lobby") throw new Error("La partida ya comenzó");
    if (room.state.players.length < 2) throw new Error("Se necesitan al menos 2 jugadores");
    room.state.round = 0;
    room.state.totalRounds =
      room.state.config.mode === "individual" ? room.state.players.length : 1;
    this.prepareRound(room);
  }

  startCountdown(code: string, actorId: string): void {
    const room = this.requireHost(code, actorId);
    if (room.state.phase !== "ready") throw new Error("La pista todavía no está preparada");
    const state = room.state;
    state.phase = "countdown";
    state.countdownEndsAt = Date.now() + 3_000;
    this.publish(room);
    this.setTimer(room, 3_000, () => {
      state.phase = "playing";
      state.countdownEndsAt = null;
      state.startedAt = Date.now();
      if (state.relayPlan) {
        state.activeTurnIndex = state.relayPlan.turns[0]?.index ?? 0;
      }
      this.publish(room);
      this.scheduleTurnAdvances(room);
      this.scheduleBlackoutEnd(room);
    });
  }

  continue(code: string, actorId: string): void {
    const room = this.requireHost(code, actorId);
    if (room.state.phase !== "score") throw new Error("Ahora no se puede continuar");
    if (room.state.round + 1 >= room.state.totalRounds) {
      room.state.phase = "finished";
      room.state.endReason = "completed";
      this.publish(room);
      return;
    }
    room.state.round += 1;
    this.prepareRound(room);
  }

  vote(code: string, playerId: string, yes: boolean): void {
    const room = this.requireRoom(code);
    if (room.state.phase !== "voting") throw new Error("La votación no está abierta");
    if (room.state.singerId === playerId) throw new Error("El cantante no puede votar");
    if (!room.state.players.some((player) => player.id === playerId)) {
      throw new Error("No perteneces a esta sala");
    }
    room.state.votes[playerId] = yes;
    this.publish(room);

    const eligible = room.state.players.filter(({ id }) => id !== room.state.singerId).length;
    const values = Object.values(room.state.votes);
    const yesVotes = values.filter(Boolean).length;
    const noVotes = values.length - yesVotes;
    if (yesVotes > eligible / 2 || noVotes >= eligible / 2 || values.length >= eligible) {
      this.resolve(room, resolveMajority(room.state.votes));
    }
  }

  resolveManually(code: string, actorId: string, correct: boolean): void {
    const room = this.requireHost(code, actorId);
    if (!["reveal", "voting"].includes(room.state.phase)) {
      throw new Error("No hay una interpretación pendiente");
    }
    this.resolve(room, correct);
  }

  recalibrate(code: string, actorId: string, deltaMs: number): void {
    const room = this.requireHost(code, actorId);
    if (room.state.phase !== "playing" || room.state.startedAt === null) {
      throw new Error("Solo se recalibra durante la reproducción");
    }
    if (!Number.isFinite(deltaMs) || Math.abs(deltaMs) > 10_000) {
      throw new Error("El ajuste debe estar entre -10000 y 10000 ms");
    }
    room.state.playbackOffsetMs += deltaMs;
    this.syncActiveTurn(room);
    this.scheduleTurnAdvances(room);
    this.scheduleBlackoutEnd(room);
    this.publish(room);
  }

  disconnect(codeInput: string, playerId: string): boolean {
    const code = codeInput.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return false;
    if (room.state.hostId === playerId) {
      this.clearAllTimers(room);
      this.rooms.delete(code);
      return true;
    }
    const leftWasSinger = room.state.singerId === playerId;
    room.state.players = room.state.players.filter((player) => player.id !== playerId);
    delete room.state.votes[playerId];

    if (
      room.state.config.mode === "relay" &&
      room.state.relayPlan &&
      ACTIVE_RELAY_PHASES.has(room.state.phase)
    ) {
      this.handleRelayPlayerLeft(room);
      return false;
    }

    if (room.state.config.mode === "individual" && ACTIVE_ROUND_PHASES.has(room.state.phase)) {
      this.handleIndividualPlayerLeft(room, leftWasSinger);
      return false;
    }

    this.publish(room);
    return false;
  }

  private handleIndividualPlayerLeft(room: Room, leftWasSinger: boolean): void {
    const state = room.state;
    if (state.players.length < 2) {
      this.clearAllTimers(room);
      state.phase = "finished";
      state.endReason = "not_enough_players";
      state.countdownEndsAt = null;
      state.revealEndsAt = null;
      this.publish(room);
      return;
    }

    if (!leftWasSinger) {
      this.publish(room);
      return;
    }

    // El cantante de la ronda se fue: saltamos al marcador sin punto.
    this.clearAllTimers(room);
    state.lastResult = false;
    state.phase = "score";
    state.countdownEndsAt = null;
    state.revealEndsAt = null;
    state.singerId = null;
    this.publish(room);
  }

  private handleRelayPlayerLeft(room: Room): void {
    const state = room.state;
    if (state.players.length < 2) {
      // Sin suficientes voces: se cierra la partida con gracia (no hay con quién seguir el relevo).
      this.clearAllTimers(room);
      state.phase = "finished";
      state.endReason = "not_enough_players";
      state.countdownEndsAt = null;
      state.revealEndsAt = null;
      state.activeTurnIndex = null;
      this.publish(room);
      return;
    }

    const song = state.song;
    if (!song || !state.relayPlan) {
      this.publish(room);
      return;
    }

    const remainingIds = state.players.map(({ id }) => id);

    if (state.phase === "ready" || state.phase === "countdown") {
      // Antes de reproducir: regenerar el plan completo es más simple y no salta el reloj.
      this.applyRelayPlan(room, planRelay(song, remainingIds));
      if (state.phase === "countdown") {
        // Reinicia el 3-2-1 para que todos vean el nuevo primer cantante.
        this.clearAllTimers(room);
        state.countdownEndsAt = Date.now() + 3_000;
        this.setTimer(room, 3_000, () => {
          state.phase = "playing";
          state.countdownEndsAt = null;
          state.startedAt = Date.now();
          state.activeTurnIndex = state.relayPlan?.turns[0]?.index ?? 0;
          this.publish(room);
          this.scheduleTurnAdvances(room);
          this.scheduleBlackoutEnd(room);
        });
      }
      this.publish(room);
      return;
    }

    // playing: reasignar solo turnos desde el vigente (preserva timestamps).
    const position = getPlaybackPosition(state);
    const current = getCurrentTurn(state.relayPlan, song, position);
    const fromIndex = current?.index ?? 0;
    const nextPlan = reassignRelayFrom(state.relayPlan, fromIndex, remainingIds);
    this.applyRelayPlan(room, nextPlan, { keepStartPosition: true });
    state.activeTurnIndex = fromIndex;
    this.scheduleTurnAdvances(room);
    this.scheduleBlackoutEnd(room);
    this.publish(room);
  }

  private applyRelayPlan(
    room: Room,
    plan: RelayPlan,
    options: { keepStartPosition?: boolean } = {},
  ): void {
    const state = room.state;
    const song = state.song;
    if (!song) return;
    const { blackout, singerId } = blackoutFromPlan(song, plan);
    state.relayPlan = plan;
    state.blackout = blackout;
    state.singerId = singerId;
    state.activeTurnIndex = plan.turns[0]?.index ?? null;
    if (!options.keepStartPosition) {
      state.startPosition = relayStartPosition(song, plan);
    }
  }

  private prepareRound(room: Room): void {
    const state = room.state;
    const picked =
      state.selectedSongId !== null ? this.findSong(state.selectedSongId) : undefined;
    state.song =
      picked && !isPlaceholderSong(picked)
        ? picked
        : selectSong([...demoSongs, ...this.externalSongs.values()], room.usedSongIds);
    if (!room.usedSongIds.includes(state.song.id)) room.usedSongIds.push(state.song.id);
    // Tras la primera ronda vuelve el sorteo salvo que el host vuelva a elegir en lobby.
    state.selectedSongId = null;

    if (state.config.mode === "relay") {
      this.applyRelayPlan(
        room,
        planRelay(
          state.song,
          state.players.map(({ id }) => id),
        ),
      );
    } else {
      state.relayPlan = null;
      state.activeTurnIndex = null;
      state.blackout = selectBlackout(state.song, state.config.blackoutDuration);
      state.startPosition = selectStartPosition(state.song, state.blackout);
      state.singerId = state.players[state.round]?.id ?? state.players[0]?.id ?? null;
    }

    state.phase = "ready";
    state.countdownEndsAt = null;
    state.startedAt = null;
    state.revealEndsAt = null;
    state.playbackOffsetMs = 0;
    state.votes = {};
    state.lastResult = null;
    state.endReason = null;
    this.publish(room);
  }

  /** Alinea `activeTurnIndex` con la posición de reproducción actual. */
  private syncActiveTurn(room: Room): void {
    const { state } = room;
    if (!state.song || !state.relayPlan || state.phase !== "playing") return;
    const turn = getCurrentTurn(state.relayPlan, state.song, getPlaybackPosition(state));
    state.activeTurnIndex = turn?.index ?? null;
  }

  private scheduleTurnAdvances(room: Room): void {
    this.clearTurnTimers(room);
    const { state } = room;
    const { song, relayPlan, startedAt, startPosition, playbackOffsetMs } = state;
    if (!song || !relayPlan || startedAt === null || state.phase !== "playing") return;

    this.syncActiveTurn(room);

    for (const turn of relayPlan.turns) {
      const { end } = resolveTurnTimes(song, turn);
      const delay = Math.max(
        0,
        startedAt + (end - startPosition) * 1_000 - playbackOffsetMs - Date.now(),
      );
      const nextIndex = turn.index + 1;
      if (nextIndex >= relayPlan.turns.length) continue;
      // Turnos ya pasados (delay 0 tras recalibrar) no deben re-publicar el índice viejo.
      if (delay === 0 && (state.activeTurnIndex ?? 0) >= nextIndex) continue;
      const timer = setTimeout(() => {
        room.turnTimers = room.turnTimers.filter((item) => item !== timer);
        if (this.rooms.get(state.code) !== room || state.phase !== "playing") return;
        if ((state.activeTurnIndex ?? -1) >= nextIndex) return;
        state.activeTurnIndex = nextIndex;
        this.publish(room);
      }, delay);
      room.turnTimers.push(timer);
    }
  }

  private scheduleBlackoutEnd(room: Room): void {
    const { startedAt, blackout, startPosition, playbackOffsetMs, relayPlan } = room.state;
    if (startedAt === null || !blackout) return;
    const delay = Math.max(
      0,
      startedAt +
        (blackout.end - startPosition) * 1_000 -
        playbackOffsetMs -
        Date.now(),
    );
    this.setTimer(room, delay, () => {
      // Asegura que el juzgado sea siempre el del turno blackout.
      if (relayPlan) {
        const judged = relayPlan.turns.find((turn) => turn.kind === "blackout");
        if (judged) room.state.singerId = judged.playerId;
      }
      room.state.phase = "reveal";
      room.state.revealEndsAt = Date.now() + 3_000;
      this.clearTurnTimers(room);
      this.publish(room);
      if (room.state.config.groupVoting) {
        this.setTimer(room, 3_000, () => {
          room.state.phase = "voting";
          room.state.revealEndsAt = null;
          this.publish(room);
        });
      }
    });
  }

  private resolve(room: Room, correct: boolean): void {
    this.clearAllTimers(room);
    room.state.lastResult = correct;
    if (correct && room.state.singerId) {
      const singer = room.state.players.find(({ id }) => id === room.state.singerId);
      if (singer) singer.score += 1;
    }
    room.state.phase = "score";
    room.state.revealEndsAt = null;
    this.publish(room);
  }

  private setTimer(room: Room, delay: number, action: () => void): void {
    this.clearTimer(room);
    room.timer = setTimeout(() => {
      room.timer = undefined;
      if (this.rooms.get(room.state.code) === room) action();
    }, delay);
  }

  private clearTimer(room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = undefined;
  }

  private clearTurnTimers(room: Room): void {
    for (const timer of room.turnTimers) clearTimeout(timer);
    room.turnTimers = [];
  }

  private clearAllTimers(room: Room): void {
    this.clearTimer(room);
    this.clearTurnTimers(room);
  }

  private publish(room: Room): void {
    room.state.hostNow = Date.now();
    this.emitState(room.state.code, room.state);
  }

  private requireRoom(codeInput: string): Room {
    const room = this.rooms.get(codeInput.trim().toUpperCase());
    if (!room) throw new Error("La sala no existe");
    return room;
  }

  private requireHost(code: string, actorId: string): Room {
    const room = this.requireRoom(code);
    if (room.state.hostId !== actorId) throw new Error("Solo el host puede hacer esto");
    return room;
  }

  private makePlayer(id: string, name: string): Player {
    const parsed = playerSchema.safeParse({ id, name: name.trim(), score: 0 });
    if (!parsed.success) throw new Error("El nombre debe tener entre 1 y 24 caracteres");
    return parsed.data;
  }

  private createCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = "";
      for (let index = 0; index < 4; index += 1) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("No se pudo crear un código de sala");
  }
}
