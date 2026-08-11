import { describe, expect, it } from "vitest";
import type { Song } from "@slay-it/shared";
import { resolveSongAudioUrl } from "./useHostAudio";

function songWithAudio(path: string): Song {
  return {
    id: "t",
    title: "T",
    artist: "A",
    duration: 10,
    genre: "pop",
    difficulty: "easy",
    chorusStart: 1,
    sections: [{ id: "s1", type: "verse", start: 0, end: 4, lineIds: ["l1"] }],
    lines: [{ id: "l1", start: 0, end: 3, text: "hola", sectionId: "s1" }],
    audioSource: { type: "local", path },
  };
}

describe("resolveSongAudioUrl", () => {
  it("devuelve null sin audioSource", () => {
    expect(resolveSongAudioUrl(null)).toBeNull();
    expect(resolveSongAudioUrl(undefined)).toBeNull();
    const bare = songWithAudio("/audio/x.mp3");
    delete (bare as { audioSource?: Song["audioSource"] }).audioSource;
    expect(resolveSongAudioUrl(bare)).toBeNull();
  });

  it("respeta la base de Vite / GitHub Pages", () => {
    expect(resolveSongAudioUrl(songWithAudio("/audio/demo.mp3"), "/")).toBe("/audio/demo.mp3");
    expect(resolveSongAudioUrl(songWithAudio("/audio/demo.mp3"), "/slay-it/")).toBe(
      "/slay-it/audio/demo.mp3",
    );
    expect(resolveSongAudioUrl(songWithAudio("audio/demo.mp3"), "/slay-it/")).toBe(
      "/slay-it/audio/demo.mp3",
    );
  });

  it("deja pasar URLs absolutas y blob", () => {
    expect(resolveSongAudioUrl(songWithAudio("https://cdn.example/a.mp3"), "/")).toBe(
      "https://cdn.example/a.mp3",
    );
    expect(resolveSongAudioUrl(songWithAudio("blob:http://localhost/1"), "/")).toBe(
      "blob:http://localhost/1",
    );
  });
});
