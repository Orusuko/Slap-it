import type { SongLine } from "@slay-it/shared";
import { describe, expect, it } from "vitest";
import { assembleUserSong } from "./userSong";

function makeLines(count: number, idPrefix: string): SongLine[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${idPrefix}-line-${index + 1}`,
    start: index * 3,
    end: index * 3 + 2.5,
    text: `Línea ${index + 1}`,
    sectionId: "placeholder",
  }));
}

describe("assembleUserSong", () => {
  it("sin estribillo marcado, arma una sola sección verse (compatibilidad)", () => {
    const lines = makeLines(4, "song-1");
    const song = assembleUserSong({
      id: "song-1",
      title: "Prueba",
      artist: "Alguien",
      duration: 20,
      lines,
    });
    expect(song.sections).toHaveLength(1);
    expect(song.sections[0]!.type).toBe("verse");
    expect(song.chorusStart).toBe(lines[0]!.start);
    expect(song.audioSource).toEqual({ type: "user" });
  });

  it("con estribillo marcado, arma secciones verse/chorus y chorusStart en el primer chorus", () => {
    const lines = makeLines(8, "song-2");
    const song = assembleUserSong({
      id: "song-2",
      title: "Prueba con estribillo",
      artist: "Alguien",
      duration: 25,
      lines,
      chorusLineIndices: new Set([2, 3, 6, 7]),
      audioSource: { type: "supabase", objectKey: "song-2" },
    });
    const types = song.sections.map((section) => section.type);
    expect(types).toEqual(["verse", "chorus", "verse", "chorus"]);
    expect(song.chorusStart).toBe(lines[2]!.start);
    expect(song.audioSource).toEqual({ type: "supabase", objectKey: "song-2" });
    // Cada línea apunta a la sección que le corresponde según el run.
    const chorusSectionId = song.sections[1]!.id;
    expect(song.lines[2]!.sectionId).toBe(chorusSectionId);
    expect(song.lines[3]!.sectionId).toBe(chorusSectionId);
  });

  it("lanza si falta título, artista o líneas", () => {
    const lines = makeLines(1, "song-3");
    expect(() => assembleUserSong({ id: "song-3", title: " ", artist: "A", duration: 5, lines })).toThrow();
    expect(() => assembleUserSong({ id: "song-3", title: "T", artist: " ", duration: 5, lines })).toThrow();
    expect(() => assembleUserSong({ id: "song-3", title: "T", artist: "A", duration: 5, lines: [] })).toThrow();
  });
});
