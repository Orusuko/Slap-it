import { songSchema, type Song } from "@slay-it/shared";

/**
 * El JSON exportado trae letra + timings + metadata, **no** el audio (puede
 * pesar decenas de MB). Al importar en otro dispositivo, si no hay blob
 * guardado, el host puede adjuntar el MP3 manualmente en la pantalla Ready.
 */
export function exportUserSongToJson(song: Song): string {
  return JSON.stringify(song, null, 2);
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "cancion";
}

export function downloadUserSongJson(song: Song): void {
  const json = exportUserSongToJson(song);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(song.title)}.slayit-song.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type ImportUserSongResult = { ok: true; song: Song } | { ok: false; error: string };

export function parseUserSongJson(raw: string): ImportUserSongResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "El archivo no es un JSON válido." };
  }
  const result = songSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: "El archivo no tiene el formato de canción de Slay It." };
  }
  return { ok: true, song: result.data };
}
