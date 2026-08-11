import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Song } from "@slay-it/shared";
import { getUserSongAudioBlob } from "../songs/userSongStore";

export type HostAudioSource = "none" | "catalog" | "manual";

export interface HostAudio {
  fileName: string | null;
  source: HostAudioSource;
  hasAudio: boolean;
  /** true mientras se comprueba si el MP3 del catálogo carga. */
  probing: boolean;
  /** true si play() fue bloqueado por el navegador y el host debe pulsar Reproducir. */
  needsGesture: boolean;
  attach: (file: File) => void;
  /** Carga `song.audioSource` solo si el recurso responde; si no, degrada a none. */
  loadCatalog: (song: Song | null) => void;
  clear: () => void;
  playFrom: (seconds: number) => Promise<boolean>;
  pause: () => void;
  seekBy: (deltaSeconds: number) => void;
  clearNeedsGesture: () => void;
  /**
   * Posición real del `<audio>` del host (`null` si no hay audio cargado).
   * Más precisa que derivar la posición del reloj de pared: no depende de
   * jitter de `setInterval` ni de cuándo el navegador realmente empezó a
   * reproducir tras `play()`.
   */
  getCurrentTime: () => number | null;
}

/** URL pública resoluble desde `song.audioSource` (GitHub Pages / Vite public). */
export function resolveSongAudioUrl(
  song: Song | null | undefined,
  base: string = import.meta.env.BASE_URL ?? "/",
): string | null {
  if (!song?.audioSource || song.audioSource.type !== "local") return null;
  const path = song.audioSource.path.trim();
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:")) {
    return path;
  }
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${normalized}`;
}

const CATALOG_LOAD_TIMEOUT_MS = 4_000;

/**
 * Prueba si una URL de audio es cargable. Extraída para poder testear el
 * degradado sin montar el hook completo.
 */
export function probeAudioUrl(
  url: string,
  timeoutMs = CATALOG_LOAD_TIMEOUT_MS,
  createAudio: () => HTMLAudioElement = () => new Audio(),
): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createAudio();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      probe.removeAttribute("src");
      probe.load();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    probe.preload = "auto";
    probe.addEventListener("canplaythrough", () => finish(true), { once: true });
    probe.addEventListener("loadeddata", () => finish(true), { once: true });
    probe.addEventListener("error", () => finish(false), { once: true });
    probe.src = url;
  });
}

/**
 * Reproduce, solo en el navegador del anfitrión, audio de catálogo
 * (`audioSource`) o un archivo adjunto manual. No se sube a ningún servidor.
 */
export function useHostAudio(): HostAudio {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const manualOverrideRef = useRef(false);
  const loadTokenRef = useRef(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [source, setSource] = useState<HostAudioSource>("none");
  const [probing, setProbing] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);

  const ensureAudio = () => {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  };

  const revokeObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const resetToNone = () => {
    const audio = ensureAudio();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    setFileName(null);
    setSource("none");
    setProbing(false);
    setNeedsGesture(false);
  };

  const attach = useCallback((file: File) => {
    revokeObjectUrl();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    manualOverrideRef.current = true;
    loadTokenRef.current += 1;
    const audio = ensureAudio();
    audio.src = url;
    audio.preload = "auto";
    setFileName(file.name);
    setSource("manual");
    setProbing(false);
    setNeedsGesture(false);
  }, []);

  const loadCatalog = useCallback((song: Song | null) => {
    if (manualOverrideRef.current) return;
    const token = ++loadTokenRef.current;

    // Canción subida por un jugador: el audio vive como blob en IndexedDB de
    // este dispositivo (no hay URL pública que sondear con `probeAudioUrl`).
    if (song?.audioSource?.type === "user") {
      setFileName(null);
      setSource("none");
      setNeedsGesture(false);
      setProbing(true);
      void getUserSongAudioBlob(song.id)
        .then((blob) => {
          if (token !== loadTokenRef.current || manualOverrideRef.current) return;
          setProbing(false);
          if (!blob) {
            resetToNone();
            return;
          }
          revokeObjectUrl();
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          const audio = ensureAudio();
          audio.src = url;
          audio.preload = "auto";
          setFileName(`${song.title} (subida)`);
          setSource("catalog");
        })
        .catch(() => {
          if (token === loadTokenRef.current) resetToNone();
        });
      return;
    }

    const url = resolveSongAudioUrl(song);
    if (!url) {
      resetToNone();
      return;
    }

    // No afirmar "audio listo" hasta confirmar que el recurso carga.
    setFileName(null);
    setSource("none");
    setNeedsGesture(false);
    setProbing(true);

    void probeAudioUrl(url).then((ok) => {
      if (token !== loadTokenRef.current || manualOverrideRef.current) return;
      setProbing(false);
      if (!ok) {
        resetToNone();
        return;
      }
      revokeObjectUrl();
      const audio = ensureAudio();
      audio.src = url;
      audio.preload = "auto";
      const label =
        song?.audioSource?.type === "local"
          ? song.audioSource.path.split("/").pop()
          : song?.title ?? "audio del catálogo";
      setFileName(label ?? "audio del catálogo");
      setSource("catalog");
    });
  }, []);

  const clear = useCallback(() => {
    loadTokenRef.current += 1;
    revokeObjectUrl();
    manualOverrideRef.current = false;
    resetToNone();
  }, []);

  const playFrom = useCallback(async (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return false;
    audio.currentTime = Math.max(0, seconds);
    try {
      await audio.play();
      setNeedsGesture(false);
      return true;
    } catch {
      setNeedsGesture(true);
      return false;
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seekBy = useCallback((deltaSeconds: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    audio.currentTime = Math.max(0, audio.currentTime + deltaSeconds);
  }, []);

  const clearNeedsGesture = useCallback(() => setNeedsGesture(false), []);

  const getCurrentTime = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return null;
    return audio.currentTime;
  }, []);

  useEffect(
    () => () => {
      loadTokenRef.current += 1;
      revokeObjectUrl();
    },
    [],
  );

  return useMemo(
    () => ({
      fileName,
      source,
      hasAudio: source !== "none",
      probing,
      needsGesture,
      attach,
      loadCatalog,
      clear,
      playFrom,
      pause,
      seekBy,
      clearNeedsGesture,
      getCurrentTime,
    }),
    [
      fileName,
      source,
      probing,
      needsGesture,
      attach,
      loadCatalog,
      clear,
      playFrom,
      pause,
      seekBy,
      clearNeedsGesture,
      getCurrentTime,
    ],
  );
}
