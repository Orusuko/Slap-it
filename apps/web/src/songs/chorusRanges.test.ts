import type { SongLine } from "@slay-it/shared";
import { describe, expect, it } from "vitest";
import { buildSectionsFromLines, pickChorusStart } from "./chorusRanges";

function makeLines(count: number, idPrefix = "song"): SongLine[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${idPrefix}-line-${index + 1}`,
    start: index * 3,
    end: index * 3 + 2.5,
    text: `Línea ${index + 1}`,
    sectionId: "placeholder",
  }));
}

describe("buildSectionsFromLines", () => {
  it("sin estribillo marcado, produce una sola sección verse con todas las líneas", () => {
    const lines = makeLines(4);
    const { sections, lines: outLines } = buildSectionsFromLines(lines, new Set(), "song");
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ type: "verse", start: lines[0]!.start, end: lines.at(-1)!.end });
    expect(sections[0]!.lineIds).toEqual(lines.map((line) => line.id));
    expect(outLines.every((line) => line.sectionId === sections[0]!.id)).toBe(true);
  });

  it("un bloque de estribillo contiguo en medio produce verse/chorus/verse", () => {
    const lines = makeLines(6);
    // Líneas 2 y 3 (índices 1 y 2) son el estribillo.
    const { sections, lines: outLines } = buildSectionsFromLines(lines, new Set([1, 2]), "song");
    expect(sections.map((section) => section.type)).toEqual(["verse", "chorus", "verse"]);
    expect(sections[1]!.lineIds).toEqual([lines[1]!.id, lines[2]!.id]);
    expect(sections[1]!.start).toBe(lines[1]!.start);
    expect(sections[1]!.end).toBe(lines[2]!.end);
    expect(outLines[1]!.sectionId).toBe(sections[1]!.id);
    expect(outLines[3]!.sectionId).toBe(sections[2]!.id);
  });

  it("permite varios bloques de estribillo separados (se repite en la canción)", () => {
    const lines = makeLines(8);
    const { sections } = buildSectionsFromLines(lines, new Set([1, 2, 5, 6]), "song");
    const chorusSections = sections.filter((section) => section.type === "chorus");
    expect(chorusSections).toHaveLength(2);
    expect(chorusSections[0]!.lineIds).toEqual([lines[1]!.id, lines[2]!.id]);
    expect(chorusSections[1]!.lineIds).toEqual([lines[5]!.id, lines[6]!.id]);
  });

  it("cuando toda la letra es estribillo produce una sola sección chorus", () => {
    const lines = makeLines(3);
    const all = new Set(lines.map((_, index) => index));
    const { sections } = buildSectionsFromLines(lines, all, "song");
    expect(sections).toHaveLength(1);
    expect(sections[0]!.type).toBe("chorus");
  });

  it("con lines vacío no produce secciones", () => {
    expect(buildSectionsFromLines([], new Set(), "song")).toEqual({ sections: [], lines: [] });
  });
});

describe("pickChorusStart", () => {
  it("usa el inicio del primer bloque chorus si existe", () => {
    const lines = makeLines(6);
    const { sections } = buildSectionsFromLines(lines, new Set([2, 3]), "song");
    expect(pickChorusStart(sections, 999)).toBe(lines[2]!.start);
  });

  it("usa el fallback si no hay ningún bloque chorus", () => {
    const lines = makeLines(3);
    const { sections } = buildSectionsFromLines(lines, new Set(), "song");
    expect(pickChorusStart(sections, 7.5)).toBe(7.5);
  });
});
