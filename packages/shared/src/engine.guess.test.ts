import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomManager } from "./engine.js";
import {
  GUESS_ANSWER_WINDOW_MS,
  GUESS_CLIP_SECONDS,
} from "./guess.js";
import { defaultGameConfig, type RoomPublicState } from "./model.js";
import { createFixtureSong } from "./testFixtures.js";

function guessRooms() {
  const published: RoomPublicState[] = [];
  const rooms = new RoomManager((_code, state) => published.push(state));
  rooms.registerSongs([
    createFixtureSong("g1", { title: "Uno", artist: "A", genre: "ranchera" }),
    createFixtureSong("g2", { title: "Dos", artist: "B", genre: "ranchera" }),
    createFixtureSong("g3", { title: "Tres", artist: "C", genre: "pop" }),
    createFixtureSong("g4", { title: "Cuatro", artist: "D", genre: "cumbia" }),
  ]);
  return { rooms, published };
}

function startGuessRoom(
  rooms: RoomManager,
  extras: { totalRounds?: number; audio?: boolean } = {},
) {
  const created = rooms.create("host", "TV");
  rooms.configure(created.code, "host", {
    ...defaultGameConfig,
    mode: "guess",
    totalRounds: extras.totalRounds ?? 3,
  });
  rooms.join(created.code, "p1", "Ada");
  rooms.join(created.code, "p2", "Lin");
  if (extras.audio) rooms.setHostHasAudio(created.code, "host", true);
  rooms.start(created.code, "host");
  return created.code;
}

function playingGuess() {
  const { rooms, published } = guessRooms();
  const code = startGuessRoom(rooms, { audio: true });
  rooms.startCountdown(code, "host");
  vi.advanceTimersByTime(3_000);
  rooms.hostConfirmPlaybackStarted(code, "host", rooms.get(code)!.startPosition);
  return { rooms, published, code };
}

describe("RoomManager modo guess", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("start en guess exige 4 canciones y no asigna cantante", () => {
    const few = new RoomManager(() => {});
    // demoSongs ya trae 1 tema real: con 2 fixtures el catálogo queda en 3.
    few.registerSongs([createFixtureSong("a"), createFixtureSong("b")]);
    const code = few.create("host", "TV").code;
    few.configure(code, "host", { ...defaultGameConfig, mode: "guess", totalRounds: 3 });
    few.join(code, "p1", "Ada");
    few.join(code, "p2", "Lin");
    expect(() => few.start(code, "host")).toThrow("al menos 4 canciones");

    const { rooms } = guessRooms();
    const created = rooms.create("host", "TV");
    rooms.configure(created.code, "host", { ...defaultGameConfig, mode: "guess", totalRounds: 3 });
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    const state = rooms.get(created.code)!;
    expect(state.phase).toBe("ready");
    expect(state.totalRounds).toBe(3);
    expect(state.singerId).toBeNull();
    expect(state.blackout).toBeNull();
    expect(state.relayPlan).toBeNull();
    expect(state.guessQuestion?.options).toHaveLength(4);
    expect(state.startPosition).toBe(state.guessQuestion!.clipStart);
  });

  it("vote, voteStars y resolveManually rechazan el modo guess", () => {
    const { rooms } = guessRooms();
    const code = startGuessRoom(rooms);
    expect(() => rooms.vote(code, "p1", true)).toThrow("Esta partida se responde con opciones");
    expect(() => rooms.voteStars(code, "p1", 5)).toThrow("Esta partida se responde con opciones");
    expect(() => rooms.resolveManually(code, "host", true)).toThrow(
      "Adivina la canción no usa resolución manual",
    );
  });

  it("tras 10s de clip abre votación; responder mal da 0; el más rápido gana más", () => {
    const { rooms, code } = playingGuess();
    vi.advanceTimersByTime(GUESS_CLIP_SECONDS * 1000);
    const open = rooms.get(code)!;
    expect(open.phase).toBe("voting");
    expect(open.guessDeadlineAt).toBeGreaterThanOrEqual(Date.now() + GUESS_ANSWER_WINDOW_MS - 5);
    expect(open.guessDeadlineAt).toBeLessThanOrEqual(Date.now() + GUESS_ANSWER_WINDOW_MS);

    const correct = open.guessQuestion!.correctOptionId;
    rooms.answer(code, "p1", correct);
    vi.advanceTimersByTime(4_000);
    rooms.answer(code, "p2", correct);
    const revealed = rooms.get(code)!;
    expect(revealed.phase).toBe("reveal");
    expect(revealed.lastGuessPoints!["p1"]).toBeGreaterThan(revealed.lastGuessPoints!["p2"]!);
    expect(revealed.players.find((player) => player.id === "p1")!.score).toBe(
      revealed.lastGuessPoints!["p1"],
    );

    const { rooms: secondRooms, code: secondCode } = playingGuess();
    vi.advanceTimersByTime(GUESS_CLIP_SECONDS * 1000);
    const wrong = secondRooms
      .get(secondCode)!
      .guessQuestion!.options.find(
        (option) => option.id !== secondRooms.get(secondCode)!.guessQuestion!.correctOptionId,
      )!.id;
    secondRooms.answer(secondCode, "p1", wrong);
    expect(() =>
      secondRooms.answer(secondCode, "p1", secondRooms.get(secondCode)!.guessQuestion!.correctOptionId),
    ).toThrow("Ya respondiste");
    vi.advanceTimersByTime(GUESS_ANSWER_WINDOW_MS);
    expect(secondRooms.get(secondCode)!.lastGuessPoints!["p1"]).toBe(0);
    expect(secondRooms.get(secondCode)!.lastGuessPoints!["p2"]).toBe(0);
  });

  it("closeGuessVoting cierra la ventana y disconnect resuelve o termina", () => {
    const { rooms, code } = playingGuess();
    vi.advanceTimersByTime(GUESS_CLIP_SECONDS * 1000);
    rooms.answer(code, "p1", rooms.get(code)!.guessQuestion!.correctOptionId);
    rooms.closeGuessVoting(code, "host");
    const closed = rooms.get(code)!;
    expect(closed.phase).toBe("reveal");
    expect(closed.lastGuessPoints!["p1"]).toBeGreaterThan(0);
    expect(closed.lastGuessPoints!["p2"]).toBe(0);

    const { rooms: trio } = guessRooms();
    const trioCode = trio.create("host", "TV").code;
    trio.configure(trioCode, "host", { ...defaultGameConfig, mode: "guess" });
    trio.join(trioCode, "p1", "Ada");
    trio.join(trioCode, "p2", "Lin");
    trio.join(trioCode, "p3", "Kai");
    trio.setHostHasAudio(trioCode, "host", true);
    trio.start(trioCode, "host");
    trio.startCountdown(trioCode, "host");
    vi.advanceTimersByTime(3_000);
    trio.hostConfirmPlaybackStarted(trioCode, "host", trio.get(trioCode)!.startPosition);
    vi.advanceTimersByTime(GUESS_CLIP_SECONDS * 1000);
    const trioCorrect = trio.get(trioCode)!.guessQuestion!.correctOptionId;
    trio.answer(trioCode, "p1", trioCorrect);
    trio.answer(trioCode, "p2", trioCorrect);
    trio.disconnect(trioCode, "p3");
    expect(trio.get(trioCode)!.phase).toBe("reveal");
    expect(trio.get(trioCode)!.guessAnswers["p3"]).toBeUndefined();
    expect(trio.get(trioCode)!.players).toHaveLength(2);

    const { rooms: emptyRooms, code: emptyCode } = playingGuess();
    emptyRooms.disconnect(emptyCode, "p1");
    expect(emptyRooms.get(emptyCode)!.phase).toBe("finished");
    expect(emptyRooms.get(emptyCode)!.endReason).toBe("not_enough_players");
  });

  it("guess usa el setlist, no todo el catálogo", () => {
    const { rooms } = guessRooms();
    const created = rooms.create("host", "TV");
    rooms.configure(created.code, "host", { ...defaultGameConfig, mode: "guess", totalRounds: 1 });
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.setSetlist(created.code, "host", ["g1", "g2", "g3"]);
    expect(() => rooms.start(created.code, "host")).toThrow("al menos 4 canciones");
    rooms.setSetlist(created.code, "host", ["g1", "g2", "g3", "g4"]);
    rooms.start(created.code, "host");
    const optionIds = rooms.get(created.code)!.guessQuestion!.options.map((option) => option.id);
    expect(optionIds.every((id) => ["g1", "g2", "g3", "g4"].includes(id))).toBe(true);
    rooms.disconnect(created.code, "host");
  });

  it("el broadcast oculta título y correcta hasta reveal", () => {
    const { rooms, published } = guessRooms();
    const code = startGuessRoom(rooms);
    const last = published.at(-1)!;
    expect(last.song?.title).toBe("???");
    expect(last.guessQuestion?.correctOptionId).toBe("");
    expect(rooms.get(code)!.song?.title).not.toBe("???");
    expect(rooms.get(code)!.guessQuestion?.correctOptionId).not.toBe("");
  });
});
