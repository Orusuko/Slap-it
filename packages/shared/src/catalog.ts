import type { Song } from "./model.js";

/**
 * Catálogo de fiesta embebido en el repo. Empieza **vacío a propósito**
 * (se retiraron las canciones de demo/placeholder y la canción real de
 * prueba para poder validar el flujo desde cero).
 *
 * Formas de tener canciones jugables:
 * 1. **Recomendada**: usar el wizard «Sube tu canción» desde `Home` — el
 *    audio + letra + timings quedan en IndexedDB del navegador del host
 *    (ver `apps/web/src/songs/`), sin tocar este archivo.
 * 2. Añadir aquí objetos `Song` reales (ver `songSchema` en `./model.ts`)
 *    con `audioSource: { type: "local", path: "/audio/archivo.mp3" }` y el
 *    MP3 correspondiente en `apps/web/public/audio/`.
 *
 * `isPlaceholderSong` (en `./game.ts`) sigue disponible por si en el futuro
 * se vuelven a usar placeholders `PLACEHOLDER — …` / `id` con prefijo
 * `placeholder-`.
 */
export const demoSongs: Song[] = [];
