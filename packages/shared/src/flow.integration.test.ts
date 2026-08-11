import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPlaybackPosition } from "./game.js";
import { RoomManager } from "./engine.js";
import { getCurrentTurn, getNextVisibleTurn } from "./relay.js";
import { createFixtureSong } from "./testFixtures.js";

/**
 * Pruebas de integración del flujo de partida extremo a extremo
 * (sin UI ni Supabase). Sirven de red de seguridad para cambios futuros
 * en el motor compartido.
 *
 * El catálogo real (`demoSongs`) empieza vacío a propósito; se registra una
 * canción fixture (mismo mecanismo que usa el wizard "Sube tu canción").
 */
describe("integración · flujo de partida", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function createTestRooms(): RoomManager {
    const rooms = new RoomManager(() => {});
    rooms.registerSongs([createFixtureSong("fixture-flow")]);
    return rooms;
  }

  function roomWithPlayers(
    mode: "relay" | "individual",
    players: Array<[string, string]>,
  ) {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.configure(created.code, "host", {
      maxPlayers: 8,
      mode,
      blackoutDuration: mode === "relay" ? "section" : "line",
      mask: "total",
      groupVoting: true,
    });
    for (const [id, name] of players) rooms.join(created.code, id, name);
    return { rooms, code: created.code };
  }

  it("relevo: lobby → ready → countdown → playing → reveal → voting → score → finished", () => {
    const { rooms, code } = roomWithPlayers("relay", [
      ["p1", "Ada"],
      ["p2", "Lin"],
      ["p3", "Kai"],
      ["p4", "Mel"],
    ]);

    expect(rooms.get(code)!.phase).toBe("lobby");
    rooms.start(code, "host");
    const ready = rooms.get(code)!;
    expect(ready.phase).toBe("ready");
    expect(ready.relayPlan).not.toBeNull();
    expect(ready.activeTurnIndex).toBe(0);
    expect(ready.singerId).toBe(
      ready.relayPlan!.turns.find((turn) => turn.kind === "blackout")!.playerId,
    );

    // Anti-spoiler: el siguiente al penúltimo no se revela si es blackout.
    const penultimate = ready.relayPlan!.turns.at(-2)!;
    expect(getNextVisibleTurn(ready.relayPlan!, penultimate)).toBeNull();

    rooms.startCountdown(code, "host");
    expect(rooms.get(code)!.phase).toBe("countdown");
    vi.advanceTimersByTime(3_000);

    const playing = rooms.get(code)!;
    expect(playing.phase).toBe("playing");
    expect(playing.startedAt).not.toBeNull();
    expect(playing.activeTurnIndex).toBe(0);

    const position = getPlaybackPosition(playing);
    const current = getCurrentTurn(playing.relayPlan!, playing.song!, position);
    expect(current?.index).toBe(0);

    // Avanza hasta el final del blackout + reveal.
    const blackoutEndMs =
      (playing.blackout!.end - playing.startPosition) * 1_000 + 50;
    vi.advanceTimersByTime(Math.max(blackoutEndMs, 1));
    expect(rooms.get(code)!.phase).toBe("reveal");
    expect(rooms.get(code)!.singerId).toBe(
      playing.relayPlan!.turns.find((turn) => turn.kind === "blackout")!.playerId,
    );

    vi.advanceTimersByTime(3_000);
    const voting = rooms.get(code)!;
    expect(voting.phase).toBe("voting");

    const judged = voting.singerId!;
    const voters = voting.players.filter((player) => player.id !== judged);
    for (const voter of voters) {
      if (rooms.get(code)!.phase !== "voting") break;
      rooms.vote(code, voter.id, true);
    }
    expect(rooms.get(code)!.phase).toBe("score");
    expect(rooms.get(code)!.lastResult).toBe(true);
    expect(rooms.get(code)!.players.find((player) => player.id === judged)!.score).toBe(1);

    rooms.continue(code, "host");
    expect(rooms.get(code)!.phase).toBe("finished");
    expect(rooms.get(code)!.endReason).toBe("completed");
    rooms.disconnect(code, "host");
  });

  it("individual: una ronda por jugador y voto grupal", () => {
    const { rooms, code } = roomWithPlayers("individual", [
      ["p1", "Ada"],
      ["p2", "Lin"],
    ]);

    rooms.start(code, "host");
    expect(rooms.get(code)!.totalRounds).toBe(2);
    expect(rooms.get(code)!.singerId).toBe("p1");
    expect(rooms.get(code)!.relayPlan).toBeNull();
    expect(rooms.get(code)!.activeTurnIndex).toBeNull();

    rooms.startCountdown(code, "host");
    vi.advanceTimersByTime(3_000);
    const playing = rooms.get(code)!;
    const blackoutEndMs =
      (playing.blackout!.end - playing.startPosition) * 1_000 + 50;
    vi.advanceTimersByTime(Math.max(blackoutEndMs, 1));
    vi.advanceTimersByTime(3_000);

    expect(rooms.get(code)!.phase).toBe("voting");
    rooms.vote(code, "p2", false);
    expect(rooms.get(code)!.phase).toBe("score");
    expect(rooms.get(code)!.lastResult).toBe(false);

    rooms.continue(code, "host");
    expect(rooms.get(code)!.phase).toBe("ready");
    expect(rooms.get(code)!.singerId).toBe("p2");
    expect(rooms.get(code)!.round).toBe(1);

    rooms.startCountdown(code, "host");
    vi.advanceTimersByTime(3_000);
    const round2 = rooms.get(code)!;
    vi.advanceTimersByTime(
      Math.max((round2.blackout!.end - round2.startPosition) * 1_000 + 50, 1),
    );
    vi.advanceTimersByTime(3_000);
    rooms.vote(code, "p1", true);
    expect(rooms.get(code)!.phase).toBe("score");
    rooms.continue(code, "host");
    expect(rooms.get(code)!.phase).toBe("finished");
    rooms.disconnect(code, "host");
  });

  it("host resuelve manualmente cuando el voto grupal está apagado", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.configure(created.code, "host", {
      maxPlayers: 8,
      mode: "individual",
      blackoutDuration: "line",
      mask: "partial",
      groupVoting: false,
    });
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    rooms.startCountdown(created.code, "host");
    vi.advanceTimersByTime(3_000);
    const playing = rooms.get(created.code)!;
    vi.advanceTimersByTime(
      Math.max((playing.blackout!.end - playing.startPosition) * 1_000 + 50, 1),
    );
    expect(rooms.get(created.code)!.phase).toBe("reveal");
    // Sin voto grupal no pasa solo a voting.
    vi.advanceTimersByTime(3_000);
    expect(rooms.get(created.code)!.phase).toBe("reveal");
    rooms.resolveManually(created.code, "host", true);
    expect(rooms.get(created.code)!.phase).toBe("score");
    expect(rooms.get(created.code)!.lastResult).toBe(true);
    rooms.disconnect(created.code, "host");
  });
});
