/** Errores de Supabase/Storage al guardar o firmar audio (P6). */

export function isDuplicateSongError(error: unknown): boolean {
  if (typeof error === "object" && error && "code" in error) {
    if (String((error as { code: unknown }).code) === "23505") return true;
  }
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return /duplicate|already exists|unique/i.test(raw);
}

export const DUPLICATE_SONG_MESSAGE =
  "Esa canción ya existe. Si quieres otra copia, cambia el archivo o el id; el dueño borra la vieja en Supabase.";

export function isSignedUrlExpired(error: unknown): boolean {
  if (typeof error === "object" && error && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    if (status === 400 || status === 403) return true;
  }
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return /\b(400|403)\b|expired|signature|jwt/i.test(raw);
}
