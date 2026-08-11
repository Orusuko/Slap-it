/**
 * Convención del editor de letra: **una línea de texto = una línea de karaoke**.
 * Limpia timestamps tipo LRC (`[00:12.34]`, `00:12`) que a veces vienen al
 * pegar letra de internet, recorta espacios y descarta líneas vacías.
 */

const LEADING_TIMESTAMP = /^\s*\[?\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]?\s*-?\s*/;

export function parseLyrics(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(LEADING_TIMESTAMP, "").trim())
    .filter((line) => line.length > 0);
}
