import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPlaybackPosition } from "./game.js";
import { RoomManager } from "./engine.js";
import { getCurrentTurn } from "./relay.js";
import { createFixtureSong } from "./testFixtures.js";

/**
 * El catálogo real (`demoSongs`) empieza vacío a propósito; estos tests
 * ejercitan relevo/blackout con canciones fixture registradas vía
 * `registerSongs` (el mismo mecanismo que usa el wizard "Sube tu canción").
 */
function createTestRooms(): RoomManager {
  const rooms = new RoomManager(() => {});
  rooms.registerSongs([
    createFixtureSong("fixture-1"),
    createFixtureSong("fixture-2"),
    createFixtureSong("fixture-3"),
  ]);
  return rooms;
}

describe("RoomManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("usa relevo por defecto y mantiene al host fuera de players", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    expect(created.players).toEqual([]);
    expect(created.config.mode).toBe("relay");
    expect(() => rooms.start(created.code, "host")).toThrow(
      "Se necesitan al menos 2 jugadores",
    );

    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");

    const state = rooms.get(created.code)!;
    expect(state.players.map(({ id }) => id)).toEqual(["p1", "p2"]);
    expect(state.totalRounds).toBe(1);
    expect(state.phase).toBe("ready");
    expect(state.relayPlan).not.toBeNull();
    expect(state.activeTurnIndex).toBe(0);
    expect(state.startPosition).toBeLessThanOrEqual(state.blackout!.start);
    expect(state.startPosition).toBeGreaterThan(0);
    rooms.disconnect(created.code, "host");
  });

  it("en modo individual cuenta una ronda por jugador", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.configure(created.code, "host", {
      maxPlayers: 8,
      mode: "individual",
      blackoutDuration: "line",
      mask: "total",
      groupVoting: true,
    });
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    expect(rooms.get(created.code)!.totalRounds).toBe(2);
    rooms.disconnect(created.code, "host");
  });

  it("aplica la recalibración solo al offset y no permite votar al host", () => {
    const rooms = createTestRooms();
    const state = rooms.create("host", "TV");
    rooms.configure(state.code, "host", {
      maxPlayers: 8,
      mode: "individual",
      blackoutDuration: "line",
      mask: "total",
      groupVoting: true,
    });
    rooms.join(state.code, "p1", "Ada");
    rooms.join(state.code, "p2", "Lin");
    rooms.start(state.code, "host");
    rooms.startCountdown(state.code, "host");
    vi.advanceTimersByTime(3_000);

    const playing = rooms.get(state.code)!;
    const startedAt = playing.startedAt;
    rooms.recalibrate(state.code, "host", 750);
    expect(playing.startedAt).toBe(startedAt);
    expect(playing.playbackOffsetMs).toBe(750);

    playing.phase = "voting";
    expect(() => rooms.vote(state.code, "host", true)).toThrow(
      "No perteneces a esta sala",
    );
    rooms.disconnect(state.code, "host");
  });

  it("en modo relevo arma un plan con una única sorpresa y singerId juzgado", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    for (const [id, name] of [["p1", "Ada"], ["p2", "Lin"], ["p3", "Kai"], ["p4", "Mel"]]) {
      rooms.join(created.code, id, name);
    }
    rooms.start(created.code, "host");

    const state = rooms.get(created.code)!;
    expect(state.totalRounds).toBe(1);
    expect(state.relayPlan).not.toBeNull();
    const turns = state.relayPlan!.turns;
    expect(turns.filter((turn) => turn.kind === "blackout")).toHaveLength(1);
    expect(turns.at(-1)!.kind).toBe("blackout");
    expect(state.singerId).toBe(turns.at(-1)!.playerId);
    expect(state.activeTurnIndex).toBe(0);
    expect(state.startPosition).toBeLessThan(state.blackout!.start);
    rooms.disconnect(created.code, "host");
  });

  it("avanza activeTurnIndex durante playing sin cambiar singerId (juzgado)", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    const judged = rooms.get(created.code)!.singerId;
    rooms.startCountdown(created.code, "host");
    vi.advanceTimersByTime(3_000);

    const playing = rooms.get(created.code)!;
    expect(playing.phase).toBe("playing");
    expect(playing.activeTurnIndex).toBe(0);
    expect(playing.singerId).toBe(judged);

    const firstEnd =
      (playing.relayPlan!.turns[0]!.sectionIds
        .map((id) => playing.song!.sections.find((section) => section.id === id)!.end)
        .reduce((a, b) => Math.max(a, b)) -
        playing.startPosition) *
      1_000;
    vi.advanceTimersByTime(Math.max(1, firstEnd + 10));
    expect(rooms.get(created.code)!.activeTurnIndex).toBeGreaterThanOrEqual(1);
    expect(rooms.get(created.code)!.singerId).toBe(judged);
    rooms.disconnect(created.code, "host");
  });

  it("si un jugador se va en ready, regenera el plan con los restantes", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    for (const [id, name] of [["p1", "Ada"], ["p2", "Lin"], ["p3", "Kai"]]) {
      rooms.join(created.code, id, name);
    }
    rooms.start(created.code, "host");
    rooms.disconnect(created.code, "p2");

    const state = rooms.get(created.code)!;
    expect(state.phase).toBe("ready");
    expect(state.players.map(({ id }) => id)).toEqual(["p1", "p3"]);
    expect(state.relayPlan).not.toBeNull();
    expect(state.relayPlan!.turns.every((turn) => ["p1", "p3"].includes(turn.playerId))).toBe(true);
    expect(state.relayPlan!.turns.filter((turn) => turn.kind === "blackout")).toHaveLength(1);
    rooms.disconnect(created.code, "host");
  });

  it("si quedan menos de 2 jugadores mid-relay, termina con endReason", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    rooms.disconnect(created.code, "p2");
    const state = rooms.get(created.code)!;
    expect(state.phase).toBe("finished");
    expect(state.endReason).toBe("not_enough_players");
    rooms.disconnect(created.code, "host");
  });

  it("tras recalibrar, activeTurnIndex sigue alineado con getCurrentTurn", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    rooms.startCountdown(created.code, "host");
    vi.advanceTimersByTime(3_000);

    rooms.recalibrate(created.code, "host", 10_000);
    rooms.recalibrate(created.code, "host", 8_000);
    const after = rooms.get(created.code)!;
    const expected = getCurrentTurn(
      after.relayPlan!,
      after.song!,
      getPlaybackPosition(after),
    );
    expect(after.activeTurnIndex).toBe(expected?.index ?? null);
    expect(expected).not.toBeNull();
    rooms.disconnect(created.code, "host");
  });

  it("en individual, si se va el cantante mid-ronda pasa a score sin punto", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.configure(created.code, "host", {
      maxPlayers: 8,
      mode: "individual",
      blackoutDuration: "line",
      mask: "total",
      groupVoting: true,
    });
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.join(created.code, "p3", "Kai");
    rooms.start(created.code, "host");
    expect(rooms.get(created.code)!.singerId).toBe("p1");
    rooms.disconnect(created.code, "p1");
    const after = rooms.get(created.code)!;
    expect(after.phase).toBe("score");
    expect(after.lastResult).toBe(false);
    expect(after.players).toHaveLength(2);
    rooms.disconnect(created.code, "host");
  });

  it("respeta la canción elegida en el lobby", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.selectSongChoice(created.code, "host", "fixture-2");
    expect(rooms.get(created.code)!.selectedSongId).toBe("fixture-2");
    rooms.start(created.code, "host");
    expect(rooms.get(created.code)!.song?.id).toBe("fixture-2");
    rooms.disconnect(created.code, "host");
  });

  it("permite elegir y jugar una canción registrada fuera del catálogo (subida por un jugador)", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    const customSong = {
      id: "custom-abc123",
      title: "Mi canción",
      artist: "Yo y mis amigos",
      duration: 12,
      genre: "custom",
      difficulty: "medium" as const,
      chorusStart: 1,
      sections: [{ id: "custom-abc123-section-1", type: "verse" as const, start: 0, end: 9, lineIds: ["custom-abc123-line-1", "custom-abc123-line-2"] }],
      lines: [
        { id: "custom-abc123-line-1", start: 0, end: 4, text: "Primera línea", sectionId: "custom-abc123-section-1" },
        { id: "custom-abc123-line-2", start: 4, end: 9, text: "Segunda línea", sectionId: "custom-abc123-section-1" },
      ],
      audioSource: { type: "user" as const },
    };

    expect(() => rooms.selectSongChoice(created.code, "host", customSong.id)).toThrow();

    rooms.registerSongs([customSong]);
    rooms.selectSongChoice(created.code, "host", customSong.id);
    expect(rooms.get(created.code)!.selectedSongId).toBe(customSong.id);
    rooms.start(created.code, "host");
    expect(rooms.get(created.code)!.song?.id).toBe(customSong.id);
    rooms.disconnect(created.code, "host");
  });

  it("si un jugador se va durante playing, reasigna turnos futuros y deja un blackout", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    for (const [id, name] of [["p1", "Ada"], ["p2", "Lin"], ["p3", "Kai"], ["p4", "Mel"]]) {
      rooms.join(created.code, id, name);
    }
    rooms.start(created.code, "host");
    rooms.startCountdown(created.code, "host");
    vi.advanceTimersByTime(3_000);

    rooms.disconnect(created.code, "p2");
    const state = rooms.get(created.code)!;
    expect(state.phase).toBe("playing");
    expect(state.players).toHaveLength(3);
    expect(state.relayPlan!.turns.filter((turn) => turn.kind === "blackout")).toHaveLength(1);
    const from = state.activeTurnIndex ?? 0;
    expect(
      state.relayPlan!.turns.slice(from).every((turn) =>
        state.players.some((player) => player.id === turn.playerId),
      ),
    ).toBe(true);
    expect(state.singerId).toBe(
      state.relayPlan!.turns.find((turn) => turn.kind === "blackout")!.playerId,
    );
    rooms.disconnect(created.code, "host");
  });
});
