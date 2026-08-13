import { describe, expect, it } from "vitest";
import { createFixtureSong } from "@slay-it/shared";
import {
  buildSetlist,
  defaultSetlistFilter,
  distinctGenres,
  distinctUploaders,
  type SetlistRecord,
} from "./setlist";

function record(id: string, genre: string, uploadedBy: string): SetlistRecord {
  return { song: createFixtureSong(id, { genre }), uploadedBy };
}

describe("buildSetlist", () => {
  const records: SetlistRecord[] = [
    record("s1", "banda", "Ana"),
    record("s2", "mariachi", "Ana"),
    record("s3", "banda", "Beto"),
    record("s4", "pop", "Beto"),
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

  it("excluye un id puntual", () => {
    const result = buildSetlist(records, {
      ...defaultSetlistFilter(),
      excludedIds: new Set(["s2"]),
    });
    expect(result.map((s) => s.id)).toEqual(["s1", "s3", "s4"]);
  });

  it("combina género ∩ uploader − excluidas hasta vaciar el pool", () => {
    const result = buildSetlist(records, {
      genres: new Set(["banda"]),
      uploaders: new Set(["Beto"]),
      excludedIds: new Set(["s3"]),
    });
    expect(result).toEqual([]);
  });

  it("distinctGenres / distinctUploaders no repiten valores", () => {
    expect(distinctGenres(records)).toEqual(["banda", "mariachi", "pop"]);
    expect(distinctUploaders(records)).toEqual(["Ana", "Beto"]);
  });
});
