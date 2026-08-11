import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Song, RoomPublicState } from "@slay-it/shared";
import { createHostEngine } from "./hostEngine";
import { createRequestId } from "../realtime/protocol";

/**
 * El catálogo real (`demoSongs`) empieza vacío a propósito; se registra una
 * canción fixture (mismo mecanismo que usa el wizard "Sube tu canción")
 * para poder ejercitar `start()`/relevo en estos tests.
 */
function createSampleSong(): Song {
  const sections = Array.from({ length: 6 }, (_, index) => {
    const start = index * 8;
    return {
      id: `sample-section-${index + 1}`,
      type: (index === 1 ? "chorus" : "verse") as "chorus" | "verse",
      start,
      end: start + 7,
      lineIds: [`sample-line-${index + 1}`],
    };
  });
  const lines = sections.map((section, index) => ({
    id: `sample-line-${index + 1}`,
    start: section.start,
    end: section.end,
    text: `Línea de prueba ${index + 1}`,
    sectionId: section.id,
  }));
  return {
    id: "sample-song",
    title: "Canción de prueba",
    artist: "Fixture",
    duration: sections.at(-1)!.end + 15,
    genre: "test",
    difficulty: "medium",
    chorusStart: sections[1]!.start,
    sections,
    lines,
  };
}

describe("hostEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("procesa comandos remotos de unión y voto sin depender de una red real", () => {
    const broadcasts: RoomPublicState[] = [];
    const engine = createHostEngine("host-1", (state) => broadcasts.push(state));
    engine.registerSongs([createSampleSong()]);

    const joinAda = engine.handleRemoteCommand({
      type: "join",
      requestId: createRequestId(),
      playerId: "p1",
      name: "Ada",
    });
    expect(joinAda.ok).toBe(true);

    const joinLin = engine.handleRemoteCommand({
      type: "join",
      requestId: createRequestId(),
      playerId: "p2",
      name: "Lin",
    });
    expect(joinLin.ok).toBe(true);
    expect(broadcasts).toHaveLength(2);
    expect(engine.state.players.map(({ id }) => id)).toEqual(["p1", "p2"]);

    const duplicateJoin = engine.handleRemoteCommand({
      type: "join",
      requestId: "dup",
      playerId: "p1",
      name: "Ada otra vez",
    });
    expect(duplicateJoin).toEqual({ requestId: "dup", ok: false, error: "Ya estás en esta sala" });

    engine.start();
    expect(engine.state.phase).toBe("ready");
    const singerId = engine.state.singerId!;

    engine.startCountdown();
    vi.advanceTimersByTime(3_000);
    expect(engine.state.phase).toBe("playing");

    // Avanza lo suficiente para superar el apagón (canciones largas), el reveal y la votación.
    vi.advanceTimersByTime(300_000);
    expect(engine.state.phase).toBe("voting");

    const singerVote = engine.handleRemoteCommand({
      type: "vote",
      requestId: "singer-vote",
      playerId: singerId,
      yes: true,
    });
    expect(singerVote).toEqual({
      requestId: "singer-vote",
      ok: false,
      error: "El cantante no puede votar",
    });

    const spectatorId = engine.state.players.find(({ id }) => id !== singerId)!.id;
    const spectatorVote = engine.handleRemoteCommand({
      type: "vote",
      requestId: "spectator-vote",
      playerId: spectatorId,
      yes: true,
    });
    expect(spectatorVote).toEqual({ requestId: "spectator-vote", ok: true });
    expect(engine.state.phase).toBe("score");
  });

  it("rechaza acciones de host inválidas con un mensaje claro", () => {
    const engine = createHostEngine("host-1", () => {});
    expect(() => engine.start()).toThrow("Se necesitan al menos 2 jugadores");
  });

  it("elimina jugador y su voto al detectar su salida por presencia", () => {
    const engine = createHostEngine("host-1", () => {});
    engine.handleRemoteCommand({ type: "join", requestId: "r1", playerId: "p1", name: "Ada" });
    engine.handleRemoteCommand({ type: "join", requestId: "r2", playerId: "p2", name: "Lin" });
    engine.removePlayer("p1");
    expect(engine.state.players.map(({ id }) => id)).toEqual(["p2"]);
  });

  it("integración host: relevo completo con voto remoto y desconexión mid-ready", () => {
    const engine = createHostEngine("host-1", () => {});
    engine.registerSongs([createSampleSong()]);
    for (const [id, name] of [
      ["p1", "Ada"],
      ["p2", "Lin"],
      ["p3", "Kai"],
    ] as const) {
      expect(
        engine.handleRemoteCommand({ type: "join", requestId: id, playerId: id, name }).ok,
      ).toBe(true);
    }

    expect(engine.state.config.mode).toBe("relay");
    engine.start();
    expect(engine.state.phase).toBe("ready");
    expect(engine.state.relayPlan).not.toBeNull();

    engine.removePlayer("p3");
    expect(engine.state.players).toHaveLength(2);
    expect(engine.state.phase).toBe("ready");
    expect(
      engine.state.relayPlan!.turns.every((turn) =>
        engine.state.players.some((player) => player.id === turn.playerId),
      ),
    ).toBe(true);

    engine.startCountdown();
    vi.advanceTimersByTime(3_000);
    expect(engine.state.phase).toBe("playing");

    vi.advanceTimersByTime(300_000);
    expect(engine.state.phase).toBe("voting");
    const judged = engine.state.singerId!;
    const voter = engine.state.players.find((player) => player.id !== judged)!;
    expect(
      engine.handleRemoteCommand({
        type: "vote",
        requestId: "v1",
        playerId: voter.id,
        yes: true,
      }).ok,
    ).toBe(true);
    expect(engine.state.phase).toBe("score");
    engine.continueRound();
    expect(engine.state.phase).toBe("finished");
  });

  it("integración host: con un solo jugador restante mid-relay termina la partida", () => {
    const engine = createHostEngine("host-1", () => {});
    engine.registerSongs([createSampleSong()]);
    engine.handleRemoteCommand({ type: "join", requestId: "r1", playerId: "p1", name: "Ada" });
    engine.handleRemoteCommand({ type: "join", requestId: "r2", playerId: "p2", name: "Lin" });
    engine.start();
    engine.removePlayer("p2");
    expect(engine.state.phase).toBe("finished");
    expect(engine.state.endReason).toBe("not_enough_players");
  });
});
