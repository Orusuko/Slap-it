import type { Song } from "@slay-it/shared";

/**
 * Filtro del setlist de una sala (P5): el host combina género, artista,
 * quién subió y exclusiones puntuales para armar el pool de esa noche sin
 * mezclar gustos de distintos grupos de amigos.
 */
export interface SetlistFilter {
  /** `"all"` = todos los géneros; si no, solo los incluidos en el set. */
  genres: "all" | ReadonlySet<string>;
  /** `"all"` = todos los artistas; si no, solo los incluidos en el set. */
  artists: "all" | ReadonlySet<string>;
  /** `"all"` = todos los que subieron algo; si no, solo los incluidos en el set. */
  uploaders: "all" | ReadonlySet<string>;
  /** Ids de canciones desmarcadas a mano por el host, sin importar género/uploader. */
  excludedIds: ReadonlySet<string>;
}

export function defaultSetlistFilter(): SetlistFilter {
  return { genres: "all", artists: "all", uploaders: "all", excludedIds: new Set() };
}

export interface SetlistRecord {
  song: Song;
  uploadedBy: string;
}

/** Clave comparable: recorta, ignora mayúsculas y acentos (`Pedro Fernández` = `pedro fernandez`). */
export function normalizeArtistKey(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function allowedArtistKeys(filter: SetlistFilter): Set<string> | null {
  if (filter.artists === "all") return null;
  return new Set([...filter.artists].map(normalizeArtistKey));
}

/** `(géneros ∩ artistas ∩ uploaders) − (ids desmarcados)`, en el orden recibido. */
export function buildSetlist(records: readonly SetlistRecord[], filter: SetlistFilter): Song[] {
  const artists = allowedArtistKeys(filter);
  return records
    .filter(({ song }) => filter.genres === "all" || filter.genres.has(song.genre))
    .filter(({ song }) => !artists || artists.has(normalizeArtistKey(song.artist)))
    .filter(({ uploadedBy }) => filter.uploaders === "all" || filter.uploaders.has(uploadedBy))
    .filter(({ song }) => !filter.excludedIds.has(song.id))
    .map(({ song }) => song);
}

/** Géneros distintos presentes en la biblioteca, para pintar los chips del lobby. */
export function distinctGenres(records: readonly SetlistRecord[]): string[] {
  return [...new Set(records.map((record) => record.song.genre))];
}

/**
 * Artistas distintos (una entrada por nombre canónico). Conserva la grafía
 * de la primera canción encontrada para que el filtro y el wizard coincidan.
 */
export function distinctArtists(records: readonly SetlistRecord[]): string[] {
  const seen = new Map<string, string>();
  for (const { song } of records) {
    const trimmed = song.artist.trim();
    if (!trimmed) continue;
    const key = normalizeArtistKey(trimmed);
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

/** Nombres de quienes subieron algo a la biblioteca, para los chips de uploader. */
export function distinctUploaders(records: readonly SetlistRecord[]): string[] {
  return [...new Set(records.map((record) => record.uploadedBy))];
}

const SUGGEST_LIMIT = 8;

/** Artistas de la biblioteca que coinciden con lo escrito (vacío = primeros N, para elegir sin teclear). */
export function suggestArtists(known: readonly string[], query: string, limit = SUGGEST_LIMIT): string[] {
  const q = normalizeArtistKey(query);
  const pool = q ? known.filter((name) => normalizeArtistKey(name).includes(q)) : [...known];
  return pool.slice(0, limit);
}

/** Si lo escrito ya existe (ignorando mayúsculas/acentos), reusa esa grafía para no fragmentar el filtro. */
export function canonicalizeArtist(known: readonly string[], typed: string): string {
  const key = normalizeArtistKey(typed);
  if (!key) return typed.trim();
  return known.find((name) => normalizeArtistKey(name) === key) ?? typed.trim();
}

/** Búsqueda del setlist: título o artista, misma normalización que el filtro de artista. */
export function filterSongsByQuery<T extends { title: string; artist: string }>(
  songs: readonly T[],
  query: string,
): T[] {
  const q = normalizeArtistKey(query);
  if (!q) return [...songs];
  return songs.filter(
    (song) =>
      normalizeArtistKey(song.title).includes(q) || normalizeArtistKey(song.artist).includes(q),
  );
}
