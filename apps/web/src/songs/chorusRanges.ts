import type { SongLine, SongSection } from "@slay-it/shared";

export interface SectionsFromLinesResult {
  sections: SongSection[];
  /** Mismas líneas de entrada, con `sectionId` reescrito a la sección que les tocó. */
  lines: SongLine[];
}

/**
 * Agrupa líneas contiguas del mismo tipo (estribillo / no estribillo) en
 * secciones `chorus`/`verse`. El estribillo puede repetirse (varios bloques
 * `chorus` separados si se marcó más de una vez); el resto de la letra
 * queda en bloques `verse`. Sin esto, el relevo/apagón (que reparten
 * `song.sections` y anclan cerca de `chorusStart`) no tienen dónde apoyarse.
 */
export function buildSectionsFromLines(
  lines: readonly SongLine[],
  chorusLineIndices: ReadonlySet<number>,
  idPrefix: string,
): SectionsFromLinesResult {
  if (lines.length === 0) return { sections: [], lines: [] };

  const sections: SongSection[] = [];
  const outLines: SongLine[] = [];

  let runStart = 0;
  let runIsChorus = chorusLineIndices.has(0);

  const flush = (endExclusive: number) => {
    const run = lines.slice(runStart, endExclusive);
    if (run.length === 0) return;
    const sectionId = `${idPrefix}-section-${sections.length + 1}`;
    sections.push({
      id: sectionId,
      type: runIsChorus ? "chorus" : "verse",
      start: run[0]!.start,
      end: run.at(-1)!.end,
      lineIds: run.map((line) => line.id),
    });
    for (const line of run) outLines.push({ ...line, sectionId });
  };

  for (let index = 1; index < lines.length; index += 1) {
    const isChorus = chorusLineIndices.has(index);
    if (isChorus !== runIsChorus) {
      flush(index);
      runStart = index;
      runIsChorus = isChorus;
    }
  }
  flush(lines.length);

  return { sections, lines: outLines };
}

/** `chorusStart` = inicio del primer bloque `chorus`; si no hay ninguno, usa `fallback`. */
export function pickChorusStart(sections: readonly SongSection[], fallback: number): number {
  const chorus = sections.find((section) => section.type === "chorus");
  return chorus ? chorus.start : fallback;
}
