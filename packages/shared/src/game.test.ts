import { describe, expect, it } from "vitest";
import {
  getCurrentLine,
  getLyricWindow,
  getPlaybackPosition,
  isPlaceholderSong,
  maskLyrics,
  selectBlackout,
  selectSong,
  selectStartPosition,
} from "./game.js";
import { createFixturePlaceholder, createFixtureSong } from "./testFixtures.js";

describe("maskLyrics", () => {
  it("conserva la primera letra y la puntuación", () => {
    expect(maskLyrics("Hola, mundo 42!")).toBe("H___, m____ 4_!");
  });
});

describe("selección y tiempo", () => {
  const songA = createFixtureSong("fixture-a");
  const songB = createFixtureSong("fixture-b");
  const placeholder = createFixturePlaceholder();
  const pool = [songA, songB, placeholder];

  it("elige una canción disponible de forma determinista (sin placeholders)", () => {
    expect(selectSong(pool, [songA.id], () => 0).id).toBe(songB.id);
    expect(isPlaceholderSong(selectSong(pool, [], () => 0))).toBe(false);
  });

  it("excluye placeholders del pool de fiesta salvo que no quede otra", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(isPlaceholderSong(selectSong(pool, [], () => i / 20))).toBe(false);
    }
    expect(selectSong([placeholder], [], () => 0).id).toBe(placeholder.id);
  });

  it("elige el blackout cerca del estribillo y lejos del final", () => {
    const blackout = selectBlackout(songA, "section", () => 0);
    expect(Math.abs(blackout.start - songA.chorusStart)).toBeLessThanOrEqual(18);
    expect(blackout.end).toBeLessThanOrEqual(songA.duration - 5);
    expect(selectStartPosition(songA, blackout)).toBe(blackout.start - 5);
  });

  it("deriva la posición desde inicio, reloj y un único ajuste", () => {
    expect(
      getPlaybackPosition(
        { startPosition: 19, startedAt: 1_000, playbackOffsetMs: 500 },
        4_000,
      ),
    ).toBe(22.5);
  });

  it("encuentra la línea actual respetando sus límites", () => {
    const line = songA.lines[0]!;
    expect(getCurrentLine(songA, line.start)?.id).toBe(line.id);
    expect(getCurrentLine(songA, line.end)).toBeNull();
    const inside = getLyricWindow(songA, line.start + 0.01);
    expect(inside.current?.id).toBe(line.id);
    expect(inside.next?.id).toBe(songA.lines[1]!.id);
  });

  it("antes de la primera línea no la elige como actual (intro / preroll)", () => {
    const first = songA.lines[0]!;
    const window = getLyricWindow(songA, Math.max(0, first.start - 1));
    expect(window.current).toBeNull();
    expect(window.next?.id).toBe(first.id);
    expect(window.previous).toBeNull();
  });

  it("en un hueco entre líneas deja current vacío y rellena previous/next", () => {
    const first = songA.lines[0]!;
    const second = songA.lines[1]!;
    expect(first.end).toBeLessThan(second.start);
    const gap = (first.end + second.start) / 2;
    const window = getLyricWindow(songA, gap);
    expect(window.current).toBeNull();
    expect(window.previous?.id).toBe(first.id);
    expect(window.next?.id).toBe(second.id);
  });

  it("después de la última línea no inventa una actual", () => {
    const last = songA.lines.at(-1)!;
    const window = getLyricWindow(songA, last.end + 1);
    expect(window.current).toBeNull();
    expect(window.previous?.id).toBe(last.id);
    expect(window.next).toBeNull();
  });
});
