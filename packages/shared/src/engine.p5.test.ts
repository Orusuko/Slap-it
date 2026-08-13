import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultGameConfig } from "./model.js";
import { RoomManager } from "./engine.js";
import { createFixtureSong } from "./testFixtures.js";

/**
 * Tests de las piezas nuevas de P5: sync de playhead (sin marcar `startedAt`
 * a ciegas), setlist del host, rondas N acumuladas y modo karaoke.
 */
function createTestRooms(): RoomManager {
  const rooms = new RoomManager(() => {});
  rooms.registerSongs([
    createFixtureSong("p5-fixture-1"),
    createFixtureSong("p5-fixture-2"),
    createFixtureSong("p5-fixture-3"),
  ]);
  return rooms;
}

describe("RoomManager · P5 sync de playhead", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function roomReadyToPlay(hostHasAudio: boolean) {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    if (hostHasAudio) rooms.setHostHasAudio(created.code, "host", true);
    rooms.start(created.code, "host");
    rooms.startCountdown(created.code, "host");
    return { rooms, code: created.code };
  }

  it("sin audio in-app, el 3-2-1 sigue marcando playing solo (compat con audio externo)", () => {
    const { rooms, code } = roomReadyToPlay(false);
    vi.advanceTimersByTime(3_000);
    const state = rooms.get(code)!;
    expect(state.phase).toBe("playing");
    expect(state.startedAt).not.toBeNull();
    expect(state.hostPlayhead).toBeNull();
    rooms.disconnect(code, "host");
  });

  it("con audio in-app, se queda en countdown hasta confirmar el playback real", () => {
    const { rooms, code } = roomReadyToPlay(true);
    vi.advanceTimersByTime(3_000);
    const waiting = rooms.get(code)!;
    expect(waiting.phase).toBe("countdown");
    expect(waiting.countdownEndsAt).toBeNull();
    expect(waiting.startedAt).toBeNull();

    rooms.hostConfirmPlaybackStarted(code, "host", 1.4);
    const playing = rooms.get(code)!;
    expect(playing.phase).toBe("playing");
    expect(playing.startedAt).not.toBeNull();
    expect(playing.hostPlayhead).toBe(1.4);
    rooms.disconnect(code, "host");
  });

  it("hostConfirmPlaybackStarted no hace nada si ya se confirmó o si no toca esperar", () => {
    const { rooms, code } = roomReadyToPlay(true);
    vi.advanceTimersByTime(3_000);
    rooms.hostConfirmPlaybackStarted(code, "host", 1.0);
    const startedAt = rooms.get(code)!.startedAt;
    rooms.hostConfirmPlaybackStarted(code, "host", 99);
    expect(rooms.get(code)!.startedAt).toBe(startedAt);
    expect(rooms.get(code)!.hostPlayhead).toBe(1.0);
    rooms.disconnect(code, "host");
  });

  it("reportPlayhead actualiza hostPlayhead y corrige drift acumulado por encima del umbral", () => {
    const { rooms, code } = roomReadyToPlay(true);
    vi.advanceTimersByTime(3_000);
    const startPosition = rooms.get(code)!.startPosition;
    rooms.hostConfirmPlaybackStarted(code, "host", startPosition);

    vi.advanceTimersByTime(2_000);
    // Sin drift real: el reloj de pared ya marca ~2s más, reportar justo eso no debe tocar el offset.
    rooms.reportPlayhead(code, "host", startPosition + 2);
    expect(rooms.get(code)!.hostPlayhead).toBe(startPosition + 2);
    expect(rooms.get(code)!.playbackOffsetMs).toBe(0);

    // Drift grande (audio real muy adelantado): corrige el offset.
    rooms.reportPlayhead(code, "host", startPosition + 5);
    expect(rooms.get(code)!.hostPlayhead).toBe(startPosition + 5);
    expect(rooms.get(code)!.playbackOffsetMs).toBeGreaterThan(0);
    rooms.disconnect(code, "host");
  });

  it("reportPlayhead no hace nada fuera de playing ni si el actor no es el host", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    rooms.reportPlayhead(created.code, "host", 5);
    expect(rooms.get(created.code)!.hostPlayhead).toBeNull();
    rooms.reportPlayhead(created.code, "not-the-host", 5);
    expect(rooms.get(created.code)!.hostPlayhead).toBeNull();
    rooms.disconnect(created.code, "host");
  });
});

describe("RoomManager · P5 setlist", () => {
  it("start() falla si el setlist queda vacío", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.setSetlist(created.code, "host", ["no-existe"]);
    expect(() => rooms.start(created.code, "host")).toThrow("El setlist está vacío");
    rooms.disconnect(created.code, "host");
  });

  it("start() sortea solo dentro del setlist configurado", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.setSetlist(created.code, "host", ["p5-fixture-2"]);
    rooms.start(created.code, "host");
    expect(rooms.get(created.code)!.song?.id).toBe("p5-fixture-2");
    rooms.disconnect(created.code, "host");
  });

  it("setSetlist(null) quita la restricción", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.setSetlist(created.code, "host", ["p5-fixture-2"]);
    rooms.setSetlist(created.code, "host", null);
    rooms.start(created.code, "host");
    expect(rooms.get(created.code)!.song).not.toBeNull();
    rooms.disconnect(created.code, "host");
  });
});

describe("RoomManager · P5 rondas N acumuladas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function roomAtScore() {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.configure(created.code, "host", {
      ...defaultGameConfig,
      mode: "individual",
      groupVoting: true,
      totalRounds: 2,
    });
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    rooms.startCountdown(created.code, "host");
    vi.advanceTimersByTime(3_000);
    const playing = rooms.get(created.code)!;
    vi.advanceTimersByTime(Math.max(1, (playing.blackout!.end - playing.startPosition) * 1_000 + 50));
    vi.advanceTimersByTime(3_000);
    rooms.vote(created.code, "p2", true);
    return { rooms, code: created.code };
  }

  it("continue() no manda a finished si quedan rondas", () => {
    const { rooms, code } = roomAtScore();
    expect(rooms.get(code)!.phase).toBe("score");
    rooms.continue(code, "host");
    expect(rooms.get(code)!.phase).toBe("ready");
    expect(rooms.get(code)!.round).toBe(1);
    rooms.disconnect(code, "host");
  });

  it("finishShow() cierra el show aunque falten rondas", () => {
    const { rooms, code } = roomAtScore();
    rooms.finishShow(code, "host");
    const state = rooms.get(code)!;
    expect(state.phase).toBe("finished");
    expect(state.endReason).toBe("completed");
    rooms.disconnect(code, "host");
  });

  it("extendRound() alarga totalRounds en 1 y prepara la siguiente ronda", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.configure(created.code, "host", {
      ...defaultGameConfig,
      mode: "individual",
      totalRounds: 1,
    });
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    rooms.startCountdown(created.code, "host");
    vi.advanceTimersByTime(3_000);
    const playing = rooms.get(created.code)!;
    vi.advanceTimersByTime(Math.max(1, (playing.blackout!.end - playing.startPosition) * 1_000 + 50));
    vi.advanceTimersByTime(3_000);
    rooms.vote(created.code, "p2", true);
    expect(rooms.get(created.code)!.phase).toBe("score");

    rooms.extendRound(created.code, "host");
    const extended = rooms.get(created.code)!;
    expect(extended.totalRounds).toBe(2);
    expect(extended.round).toBe(1);
    expect(extended.phase).toBe("ready");
    rooms.disconnect(created.code, "host");
  });

  it("player.score se acumula ronda a ronda", () => {
    const { rooms, code } = roomAtScore();
    const afterRound1 = rooms.get(code)!.players.find((p) => p.id === "p1")!.score;
    expect(afterRound1).toBe(1);
    rooms.continue(code, "host");
    rooms.startCountdown(code, "host");
    vi.advanceTimersByTime(3_000);
    const playing = rooms.get(code)!;
    vi.advanceTimersByTime(Math.max(1, (playing.blackout!.end - playing.startPosition) * 1_000 + 50));
    vi.advanceTimersByTime(3_000);
    rooms.vote(code, "p1", true);
    expect(rooms.get(code)!.players.find((p) => p.id === "p2")!.score).toBe(1);
    expect(rooms.get(code)!.phase).toBe("score");
    rooms.disconnect(code, "host");
  });
});

describe("RoomManager · P5 modo karaoke", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function karaokeRoomPlaying(karaokeSingerIds: string[] = []) {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.configure(created.code, "host", {
      ...defaultGameConfig,
      mode: "karaoke",
      totalRounds: 1,
      karaokeSingerIds,
    });
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.join(created.code, "p3", "Kai");
    rooms.start(created.code, "host");
    rooms.startCountdown(created.code, "host");
    vi.advanceTimersByTime(3_000);
    return { rooms, code: created.code };
  }

  it("no genera blackout ni relayPlan; letra siempre visible", () => {
    const { rooms, code } = karaokeRoomPlaying();
    const state = rooms.get(code)!;
    expect(state.blackout).toBeNull();
    expect(state.relayPlan).toBeNull();
    expect(state.singerId).not.toBeNull();
    rooms.disconnect(code, "host");
  });

  it("respeta a los cantantes elegidos por el host y cicla por ronda", () => {
    const { rooms, code } = karaokeRoomPlaying(["p2"]);
    expect(rooms.get(code)!.singerId).toBe("p2");
    rooms.disconnect(code, "host");
  });

  it("endKaraokeTurn pasa a voting; solo los no-cantantes pueden votar estrellas", () => {
    const { rooms, code } = karaokeRoomPlaying(["p1"]);
    rooms.endKaraokeTurn(code, "host");
    expect(rooms.get(code)!.phase).toBe("voting");

    expect(() => rooms.voteStars(code, "p1", 5)).toThrow("Quien canta no puede votar");
    expect(() => rooms.vote(code, "p2", true)).toThrow("voto de estrellas");

    rooms.voteStars(code, "p2", 4);
    rooms.voteStars(code, "p3", 5);
    const resolved = rooms.get(code)!;
    expect(resolved.phase).toBe("score");
    expect(resolved.lastStars).toBe(9);
    expect(resolved.players.find((p) => p.id === "p1")!.score).toBe(9);
    rooms.disconnect(code, "host");
  });

  it("closeKaraokeVoting resuelve con los votos que haya, aunque falten", () => {
    const { rooms, code } = karaokeRoomPlaying(["p1"]);
    rooms.endKaraokeTurn(code, "host");
    rooms.voteStars(code, "p2", 3);
    rooms.closeKaraokeVoting(code, "host");
    const resolved = rooms.get(code)!;
    expect(resolved.phase).toBe("score");
    expect(resolved.lastStars).toBe(3);
    rooms.disconnect(code, "host");
  });
});
