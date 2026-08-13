import type { Song } from "@slay-it/shared";

/**
 * Filtro del setlist de una sala (P5): el host combina género, quién subió y
 * exclusiones puntuales para armar el pool de esa noche sin mezclar gustos
 * de distintos grupos de amigos.
 */
export interface SetlistFilter {
  /** `"all"` = todos los géneros; si no, solo los incluidos en el set. */
  genres: "all" | ReadonlySet<string>;
  /** `"all"` = todos los que subieron algo; si no, solo los incluidos en el set. */
  uploaders: "all" | ReadonlySet<string>;
  /** Ids de canciones desmarcadas a mano por el host, sin importar género/uploader. */
  excludedIds: ReadonlySet<string>;
}

export function defaultSetlistFilter(): SetlistFilter {
  return { genres: "all", uploaders: "all", excludedIds: new Set() };
}

export interface SetlistRecord {
  song: Song;
  uploadedBy: string;
}

/** `(géneros activos) ∩ (uploaders activos) − (ids desmarcados)`, en el orden recibido. */
export function buildSetlist(records: readonly SetlistRecord[], filter: SetlistFilter): Song[] {
  return records
    .filter(({ song }) => filter.genres === "all" || filter.genres.has(song.genre))
    .filter(({ uploadedBy }) => filter.uploaders === "all" || filter.uploaders.has(uploadedBy))
    .filter(({ song }) => !filter.excludedIds.has(song.id))
    .map(({ song }) => song);
}

/** Géneros distintos presentes en la biblioteca, para pintar los chips del lobby. */
export function distinctGenres(records: readonly SetlistRecord[]): string[] {
  return [...new Set(records.map((record) => record.song.genre))];
}

/** Nombres de quienes subieron algo a la biblioteca, para los chips de uploader. */
export function distinctUploaders(records: readonly SetlistRecord[]): string[] {
  return [...new Set(records.map((record) => record.uploadedBy))];
}
