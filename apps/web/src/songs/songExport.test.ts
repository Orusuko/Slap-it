import { describe, expect, it } from "vitest";
import type { Song } from "@slay-it/shared";
import { exportUserSongToJson, parseUserSongJson } from "./songExport";

function sampleSong(): Song {
  return {
    id: "custom-abc",
    title: "Mi canción",
    artist: "Yo",
    duration: 10,
    genre: "custom",
    difficulty: "medium",
    chorusStart: 1,
    sections: [{ id: "custom-abc-section-1", type: "verse", start: 0, end: 4, lineIds: ["custom-abc-line-1"] }],
    lines: [{ id: "custom-abc-line-1", start: 0, end: 3, text: "hola", sectionId: "custom-abc-section-1" }],
    audioSource: { type: "user" },
  };
}

describe("songExport", () => {
  it("exporta e importa la misma canción sin pérdida", () => {
    const song = sampleSong();
    const json = exportUserSongToJson(song);
    const result = parseUserSongJson(json);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.song).toEqual(song);
  });

  it("rechaza JSON inválido", () => {
    const result = parseUserSongJson("{ esto no es json");
    expect(result).toEqual({ ok: false, error: "El archivo no es un JSON válido." });
  });

  it("rechaza JSON válido que no cumple el esquema de canción", () => {
    const result = parseUserSongJson(JSON.stringify({ hola: "mundo" }));
    expect(result.ok).toBe(false);
  });
});
