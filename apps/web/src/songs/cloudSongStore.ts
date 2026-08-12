import { songSchema, type Song } from "@slay-it/shared";
import { getSupabaseClient } from "../realtime/client";

const TABLE = "songs";
const BUCKET = "song-audio";
/** Debe coincidir con `file_size_limit` del bucket en `supabase/schema.sql`. */
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 3_600;
const UPLOADER_NAME_KEY = "slay-it-uploader-name";

export interface CloudSongRecord {
  song: Song;
  uploadedBy: string;
  createdAt: string;
}

interface SongRow {
  id: string;
  title: string;
  artist: string;
  duration: number;
  uploaded_by: string;
  song: unknown;
  created_at: string;
}

function rowToRecord(row: SongRow): CloudSongRecord | null {
  const parsed = songSchema.safeParse(row.song);
  if (!parsed.success) return null;
  return { song: parsed.data, uploadedBy: row.uploaded_by, createdAt: row.created_at };
}

/** Toda la biblioteca del grupo, más reciente primero. */
export async function listCloudSongs(): Promise<CloudSongRecord[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLE)
    .select("id,title,artist,duration,uploaded_by,song,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SongRow[])
    .map(rowToRecord)
    .filter((record): record is CloudSongRecord => record !== null);
}

/** true si ya hay una canción con el mismo título y artista (para avisar antes de duplicar). */
export async function cloudSongExists(title: string, artist: string): Promise<boolean> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLE)
    .select("id")
    .ilike("title", title.trim())
    .ilike("artist", artist.trim())
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export type SaveCloudSongStage = "uploading" | "saving";

/**
 * Sube el MP3 al bucket `song-audio` (key = `song.id`) y luego guarda la
 * fila en `songs`. Si falla el guardado de la fila, intenta limpiar el
 * audio recién subido para no dejar huérfanos.
 */
export async function saveCloudSong(
  song: Song,
  audioFile: File,
  uploadedBy: string,
  onStage?: (stage: SaveCloudSongStage) => void,
): Promise<void> {
  if (audioFile.size > MAX_AUDIO_BYTES) {
    throw new Error(
      `El audio pesa ${(audioFile.size / (1024 * 1024)).toFixed(1)} MB; el máximo son ${MAX_AUDIO_BYTES / (1024 * 1024)} MB. Usa un MP3 más comprimido.`,
    );
  }
  const client = getSupabaseClient();
  const objectKey = song.id;

  onStage?.("uploading");
  const uploadResult = await client.storage.from(BUCKET).upload(objectKey, audioFile, {
    upsert: true,
    contentType: audioFile.type || "audio/mpeg",
  });
  if (uploadResult.error) throw new Error(uploadResult.error.message);

  onStage?.("saving");
  const row = {
    id: song.id,
    title: song.title,
    artist: song.artist,
    duration: song.duration,
    uploaded_by: uploadedBy.trim() || "Anónimo",
    song,
  };
  const { error } = await client.from(TABLE).upsert(row);
  if (error) {
    await client.storage.from(BUCKET).remove([objectKey]).catch(() => {});
    throw new Error(error.message);
  }
}

/** Borra la fila y el audio de la biblioteca (irreversible para todo el grupo). */
export async function deleteCloudSong(id: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
  await client.storage.from(BUCKET).remove([id]).catch(() => {});
}

/** URL firmada temporal (≈1h) para reproducir el audio de una canción de la biblioteca. */
export async function getCloudAudioUrl(
  objectKey: string,
  expiresInSeconds = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(objectKey, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Nombre recordado en este dispositivo para no volver a pedirlo cada vez que se sube. */
export function getStoredUploaderName(): string {
  try {
    return localStorage.getItem(UPLOADER_NAME_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setStoredUploaderName(name: string): void {
  try {
    localStorage.setItem(UPLOADER_NAME_KEY, name.trim());
  } catch {
    // Almacenamiento no disponible (ej. modo privado estricto): no es crítico.
  }
}
