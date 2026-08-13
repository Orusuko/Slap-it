import { songSchema, type Song, type SongLine } from "@slay-it/shared";
import { createRandomId } from "../realtime/protocol";
import { buildSectionsFromLines, pickChorusStart } from "./chorusRanges";

export function createUserSongId(): string {
  return `custom-${createRandomId()}`;
}

export interface AssembleUserSongInput {
  id: string;
  title: string;
  artist: string;
  /** Duración del archivo de audio en segundos (metadata del `<audio>`). */
  duration: number;
  lines: SongLine[];
  /**
   * Índices (dentro de `lines`, en el mismo orden) marcados como estribillo
   * en el wizard. Se agrupan en runs contiguos: cada run se convierte en una
   * `SongSection` `chorus`; el resto en secciones `verse`. Sin al menos un
   * bloque `chorus`, todo queda como una sola sección `verse` (compatibilidad
   * con canciones creadas antes de poder marcar estribillo).
   */
  chorusLineIndices?: ReadonlySet<number>;
  /** Por defecto `{ type: "user" }`; el wizard pasa `{ type: "supabase", objectKey }`. */
  audioSource?: Song["audioSource"];
  /** Género de `SONG_GENRES` (P5); por defecto `"otro"` para llamadas que no lo pasan. */
  genre?: string;
}

/**
 * Ensambla un `Song` válido a partir de una canción subida por un jugador:
 * agrupa la letra ya temporizada en secciones `verse`/`chorus` según el
 * estribillo marcado, para que relevo y apagón tengan estrofas reales.
 */
export function assembleUserSong(input: AssembleUserSongInput): Song {
  const title = input.title.trim();
  const artist = input.artist.trim();
  if (!title || !artist) throw new Error("Faltan título o artista.");
  if (input.lines.length === 0) throw new Error("La canción necesita al menos una línea de letra.");

  const duration = Math.max(input.duration, input.lines.at(-1)!.end + 0.5);
  const { sections, lines } = buildSectionsFromLines(
    input.lines,
    input.chorusLineIndices ?? new Set<number>(),
    input.id,
  );
  const fallbackChorusStart = Math.min(input.lines[0]!.start, Math.max(0, duration - 0.5));
  const chorusStart = pickChorusStart(sections, fallbackChorusStart);

  return songSchema.parse({
    id: input.id,
    title,
    artist,
    duration,
    genre: input.genre?.trim() || "otro",
    difficulty: "medium",
    chorusStart,
    sections,
    lines,
    audioSource: input.audioSource ?? { type: "user" },
  });
}
