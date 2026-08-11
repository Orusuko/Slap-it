import { songSchema, type Song, type SongSection } from "./model.js";

/**
 * Generador de canciones **solo para tests** del motor compartido.
 *
 * El catálogo de producción (`catalog.ts`) empieza vacío a propósito: las
 * canciones reales llegan por el wizard «Sube tu canción» o se añaden a mano
 * más adelante. Los tests de `engine`/`relay`/`game` necesitan de todos
 * modos canciones con suficientes estrofas para ejercitar relevo/blackout;
 * este archivo las genera sin depender del catálogo real.
 */

const SECTIONS_PER_SONG = 16;
const LINES_PER_SECTION = 2;
const LINE_DURATION = 3.2;
const LINE_GAP = 0.4;
const SECTION_SPAN = LINES_PER_SECTION * (LINE_DURATION + LINE_GAP);
const SECTION_GAP = 2.4;
const INTRO_PADDING = 4;
const CHORUS_SECTION_INDEX = 3;

function sectionType(index: number): SongSection["type"] {
  if (index === 3 || index === 9 || index === 15) return "chorus";
  if (index === 6 || index === 12) return "bridge";
  return "verse";
}

export function createFixtureSong(
  id = "fixture-song",
  overrides: Partial<Pick<Song, "title" | "artist" | "genre">> = {},
): Song {
  const sections: SongSection[] = [];
  const lines: Song["lines"] = [];

  for (let sectionIndex = 0; sectionIndex < SECTIONS_PER_SONG; sectionIndex += 1) {
    const sectionId = `${id}-section-${sectionIndex + 1}`;
    const sectionStart = INTRO_PADDING + sectionIndex * (SECTION_SPAN + SECTION_GAP);
    const lineIds: string[] = [];

    for (let lineOffset = 0; lineOffset < LINES_PER_SECTION; lineOffset += 1) {
      const globalIndex = sectionIndex * LINES_PER_SECTION + lineOffset;
      const lineId = `${id}-line-${globalIndex + 1}`;
      const start = sectionStart + lineOffset * (LINE_DURATION + LINE_GAP);
      lines.push({
        id: lineId,
        start,
        end: start + LINE_DURATION,
        text: `Línea de prueba ${globalIndex + 1}`,
        sectionId,
      });
      lineIds.push(lineId);
    }

    sections.push({
      id: sectionId,
      type: sectionType(sectionIndex),
      start: sectionStart,
      end: sectionStart + SECTION_SPAN,
      lineIds,
    });
  }

  const lastSection = sections.at(-1)!;
  const duration = Math.ceil(lastSection.end) + 15;

  return songSchema.parse({
    id,
    title: overrides.title ?? `Canción de prueba (${id})`,
    artist: overrides.artist ?? "Fixture",
    duration,
    genre: overrides.genre ?? "test",
    difficulty: "medium",
    chorusStart: sections[CHORUS_SECTION_INDEX]!.start,
    sections,
    lines,
  });
}

/** Variante marcada como placeholder, útil para tests de `isPlaceholderSong`/pool de fiesta. */
export function createFixturePlaceholder(id = "placeholder-fixture"): Song {
  return createFixtureSong(id, { title: "PLACEHOLDER — Fixture" });
}
