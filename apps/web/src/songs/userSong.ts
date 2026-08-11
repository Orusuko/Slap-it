import { songSchema, type Song, type SongLine } from "@slay-it/shared";
import { createRandomId } from "../realtime/protocol";

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
}

/**
 * Ensambla un `Song` válido a partir de una canción subida por un jugador:
 * una sola sección "verse" que engloba todas las líneas (suficiente para
 * jugar relevo básico; no hace falta marcar estribillo/puente a mano).
 */
export function assembleUserSong(input: AssembleUserSongInput): Song {
  const title = input.title.trim();
  const artist = input.artist.trim();
  if (!title || !artist) throw new Error("Faltan título o artista.");
  if (input.lines.length === 0) throw new Error("La canción necesita al menos una línea de letra.");

  const sectionId = `${input.id}-section-1`;
  const duration = Math.max(input.duration, input.lines.at(-1)!.end + 0.5);
  const chorusStart = Math.min(input.lines[0]!.start, Math.max(0, duration - 0.5));

  return songSchema.parse({
    id: input.id,
    title,
    artist,
    duration,
    genre: "custom",
    difficulty: "medium",
    chorusStart,
    sections: [
      {
        id: sectionId,
        type: "verse",
        start: input.lines[0]!.start,
        end: input.lines.at(-1)!.end,
        lineIds: input.lines.map((line) => line.id),
      },
    ],
    lines: input.lines,
    audioSource: { type: "user" },
  });
}
