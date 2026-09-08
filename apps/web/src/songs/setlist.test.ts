import { describe, expect, it } from "vitest";
import { createFixtureSong } from "@slay-it/shared";
import {
  buildSetlist,
  canonicalizeArtist,
  defaultSetlistFilter,
  distinctArtists,
  distinctGenres,
  distinctUploaders,
  filterSongsByQuery,
  suggestArtists,
  type SetlistRecord,
} from "./setlist";

function record(id: string, genre: string, uploadedBy: string, artist = "Fixture"): SetlistRecord {
  return { song: createFixtureSong(id, { genre, artist }), uploadedBy };
}

describe("buildSetlist", () => {
  const records: SetlistRecord[] = [
    record("s1", "banda", "Ana", "Los Tigres"),
    record("s2", "mariachi", "Ana", "Pedro Fernández"),
    record("s3", "banda", "Beto", "Los Tigres"),
    record("s4", "pop", "Beto", "Café Tacvba"),
  ];

  it("con el filtro por defecto devuelve todo", () => {
    expect(buildSetlist(records, defaultSetlistFilter()).map((s) => s.id)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
    ]);
  });

  it("excluye un género", () => {
    const result = buildSetlist(records, {
      ...defaultSetlistFilter(),
      genres: new Set(["banda", "pop"]),
    });
    expect(result.map((s) => s.id)).toEqual(["s1", "s3", "s4"]);
  });

  it("excluye un uploader", () => {
    const result = buildSetlist(records, {
      ...defaultSetlistFilter(),
      uploaders: new Set(["Ana"]),
    });
    expect(result.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("excluye un artista (agrupa grafías distintas)", () => {
    const mixed = [
      ...records,
      record("s5", "ranchera", "Ana", "pedro fernandez"),
    ];
    const result = buildSetlist(mixed, {
      ...defaultSetlistFilter(),
      artists: new Set(["Pedro Fernández"]),
    });
    expect(result.map((s) => s.id)).toEqual(["s2", "s5"]);
  });

  it("excluye un id puntual", () => {
    const result = buildSetlist(records, {
      ...defaultSetlistFilter(),
      excludedIds: new Set(["s2"]),
    });
    expect(result.map((s) => s.id)).toEqual(["s1", "s3", "s4"]);
  });

  it("combina género ∩ artista ∩ uploader − excluidas hasta vaciar el pool", () => {
    const result = buildSetlist(records, {
      genres: new Set(["banda"]),
      artists: new Set(["Los Tigres"]),
      uploaders: new Set(["Beto"]),
      excludedIds: new Set(["s3"]),
    });
    expect(result).toEqual([]);
  });

  it("distinctGenres / distinctArtists / distinctUploaders no repiten valores", () => {
    expect(distinctGenres(records)).toEqual(["banda", "mariachi", "pop"]);
    expect(distinctArtists(records)).toEqual(["Café Tacvba", "Los Tigres", "Pedro Fernández"]);
    expect(distinctUploaders(records)).toEqual(["Ana", "Beto"]);
  });

  it("distinctArtists colapsa el mismo artista con distinta grafía", () => {
    const mixed = [record("a", "banda", "Ana", "Pedro Fernández"), record("b", "banda", "Beto", "pedro fernandez")];
    expect(distinctArtists(mixed)).toEqual(["Pedro Fernández"]);
  });
});

describe("suggestArtists / canonicalizeArtist", () => {
  const known = ["Café Tacvba", "Los Tigres", "Pedro Fernández"];

  it("sin texto muestra los primeros conocidos", () => {
    expect(suggestArtists(known, "")).toEqual(known);
  });

  it("filtra por fragmento ignorando acentos", () => {
    expect(suggestArtists(known, "pedro")).toEqual(["Pedro Fernández"]);
    expect(suggestArtists(known, "cafe")).toEqual(["Café Tacvba"]);
  });

  it("canonicalizeArtist reusa la grafía guardada", () => {
    expect(canonicalizeArtist(known, "pedro fernandez")).toBe("Pedro Fernández");
    expect(canonicalizeArtist(known, "Nuevo Solista")).toBe("Nuevo Solista");
  });
});

describe("filterSongsByQuery", () => {
  it("filtra por título o artista ignorando acentos", () => {
    const songs = [
      createFixtureSong("s1", { title: "La Llorona", artist: "Chavela Vargas" }),
      createFixtureSong("s2", { title: "Cielito Lindo", artist: "Pedro Infante" }),
    ];
    expect(filterSongsByQuery(songs, "").map((song) => song.id)).toEqual(["s1", "s2"]);
    expect(filterSongsByQuery(songs, "llorona").map((song) => song.id)).toEqual(["s1"]);
    expect(filterSongsByQuery(songs, "pedro").map((song) => song.id)).toEqual(["s2"]);
  });
});
