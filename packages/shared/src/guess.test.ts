import { describe, expect, it } from "vitest";
import { createFixtureSong } from "./testFixtures.js";
import {
  GUESS_CLIP_SECONDS,
  buildGuessQuestion,
  guessOptionLabel,
  sanitizeGuessState,
  scoreGuessAnswer,
  selectGuessClip,
} from "./guess.js";
import { defaultGameConfig, type GameConfig, type RoomPublicState } from "./model.js";

describe("guess helpers", () => {
  it("selectGuessClip recorta si el estribillo no deja 10s", () => {
    const clip = selectGuessClip({ chorusStart: 95, duration: 100 });
    expect(clip.clipStart).toBe(90);
    expect(clip.clipEnd).toBe(100);
  });

  it("selectGuessClip usa chorusStart cuando cabe", () => {
    const clip = selectGuessClip({ chorusStart: 20, duration: 180 });
    expect(clip).toEqual({ clipStart: 20, clipEnd: 20 + GUESS_CLIP_SECONDS });
  });

  it("guessOptionLabel añade artista solo si el título choca", () => {
    expect(guessOptionLabel({ title: "La Bamba", artist: "Ritchie" }, [{ title: "Cielito Lindo" }])).toBe(
      "La Bamba",
    );
    expect(guessOptionLabel({ title: "Cielito Lindo", artist: "Pedro" }, [{ title: "Cielito Lindo" }])).toBe(
      "Cielito Lindo — Pedro",
    );
  });

  it("buildGuessQuestion arma 4 opciones con la correcta y falla con menos de 3 distractores", () => {
    const songs = [
      createFixtureSong("g1", { title: "Uno", artist: "A", genre: "ranchera" }),
      createFixtureSong("g2", { title: "Dos", artist: "B", genre: "ranchera" }),
      createFixtureSong("g3", { title: "Tres", artist: "C", genre: "pop" }),
      createFixtureSong("g4", { title: "Uno", artist: "D", genre: "ranchera" }),
    ];
    const question = buildGuessQuestion(songs[0]!, songs, () => 0);
    expect(question.options).toHaveLength(4);
    expect(question.correctOptionId).toBe("g1");
    expect(new Set(question.options.map((option) => option.id)).size).toBe(4);
    const unoLabels = question.options
      .filter((option) => option.id === "g1" || option.id === "g4")
      .map((option) => option.label);
    expect(unoLabels.every((label) => label.includes("—"))).toBe(true);
    expect(() => buildGuessQuestion(songs[0]!, songs.slice(0, 3), () => 0)).toThrow(
      "Se necesitan al menos 4 canciones en la biblioteca para Adivina la canción.",
    );
  });

  it("scoreGuessAnswer es Kahoot 1000–500", () => {
    expect(scoreGuessAnswer(false, 1000, 0)).toBe(0);
    expect(scoreGuessAnswer(true, 0, 0)).toBe(1000);
    expect(scoreGuessAnswer(true, 15_000, 0)).toBe(500);
    expect(scoreGuessAnswer(true, 7_500, 0)).toBe(750);
  });

  it("sanitizeGuessState oculta spoiler hasta reveal", () => {
    const song = createFixtureSong("g1", { title: "Secreto", artist: "X" });
    const base = {
      config: { ...defaultGameConfig, mode: "guess" as const },
      phase: "voting" as const,
      song,
      guessQuestion: {
        options: [{ id: "g1", label: "Secreto" }],
        correctOptionId: "g1",
        clipStart: 10,
        clipEnd: 20,
      },
    } as RoomPublicState;
    const hidden = sanitizeGuessState(base);
    expect(hidden.song?.title).toBe("???");
    expect(hidden.song?.artist).toBe("???");
    expect(hidden.song?.lines.every((line) => line.text.trim() === "")).toBe(true);
    expect(hidden.guessQuestion?.correctOptionId).toBe("");
    expect(sanitizeGuessState({ ...base, phase: "reveal" }).guessQuestion?.correctOptionId).toBe("g1");
    expect(sanitizeGuessState({ ...base, config: defaultGameConfig }).song?.title).toBe("Secreto");
  });

  it("guess es un modo válido y el default sigue siendo relevo", () => {
    expect(defaultGameConfig.mode).toBe("relay");
    const mode: GameConfig["mode"] = "guess";
    expect(mode).toBe("guess");
  });
});
