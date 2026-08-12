import type { Song } from "./model.js";
import { yoElAventurero } from "./songs/yo-el-aventurero.js";

/**
 * Catálogo de fiesta embebido en el repo.
 *
 * Incluye la canción real ya usada en el proyecto (Pedro Fernández —
 * Yo el aventurero). Más canciones: wizard «Sube tu canción» (IndexedDB)
 * o entradas adicionales aquí con `audioSource.local` + MP3 en
 * `apps/web/public/audio/`.
 *
 * `isPlaceholderSong` (en `./game.ts`) sigue disponible por si en el futuro
 * se vuelven a usar placeholders `PLACEHOLDER — …` / `id` con prefijo
 * `placeholder-`.
 */
export const demoSongs: Song[] = [yoElAventurero];
