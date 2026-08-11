import type { Song } from "@slay-it/shared";

const DB_NAME = "slay-it-songs";
const DB_VERSION = 1;
const SONGS_STORE = "songs";
const AUDIO_STORE = "audio";

export interface UserSongRecord {
  song: Song;
  createdAt: number;
  /** true si esta canción tiene un blob de audio guardado en este dispositivo. */
  hasAudio: boolean;
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Error de IndexedDB"));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error("Este navegador no permite guardar canciones localmente (IndexedDB no disponible)."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SONGS_STORE)) {
        db.createObjectStore(SONGS_STORE, { keyPath: "song.id" });
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la base local."));
  });
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

/** Todas las canciones subidas en este dispositivo, más reciente primero. */
export async function listUserSongs(): Promise<UserSongRecord[]> {
  return withDb(async (db) => {
    const tx = db.transaction(SONGS_STORE, "readonly");
    const all = await promisify(tx.objectStore(SONGS_STORE).getAll());
    return (all as UserSongRecord[]).sort((a, b) => b.createdAt - a.createdAt);
  });
}

/**
 * Guarda (o reemplaza) la canción y, si se aporta, su audio.
 * `audioBlob === null` guarda solo metadata/letra (ej. tras importar un JSON
 * sin audio); el host podrá adjuntar el MP3 manualmente más adelante.
 */
export async function saveUserSong(song: Song, audioBlob: Blob | null): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SONGS_STORE, AUDIO_STORE], "readwrite");
      const record: UserSongRecord = { song, createdAt: Date.now(), hasAudio: audioBlob !== null };
      tx.objectStore(SONGS_STORE).put(record);
      if (audioBlob) {
        tx.objectStore(AUDIO_STORE).put(audioBlob, song.id);
      } else {
        tx.objectStore(AUDIO_STORE).delete(song.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("No se pudo guardar la canción"));
      tx.onabort = () => reject(tx.error ?? new Error("Guardado cancelado"));
    });
  } finally {
    db.close();
  }
}

export async function deleteUserSong(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SONGS_STORE, AUDIO_STORE], "readwrite");
      tx.objectStore(SONGS_STORE).delete(id);
      tx.objectStore(AUDIO_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("No se pudo eliminar la canción"));
    });
  } finally {
    db.close();
  }
}

export async function getUserSongAudioBlob(id: string): Promise<Blob | null> {
  if (!isIndexedDbAvailable()) return null;
  return withDb(async (db) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const blob = await promisify<Blob | undefined>(tx.objectStore(AUDIO_STORE).get(id));
    return blob ?? null;
  });
}
