export type GameStartMode = "individual" | "relay" | "karaoke" | "guess";

export interface CanStartShowInput {
  playerCount: number;
  mode: GameStartMode;
  guessCatalogCount: number;
  setlistCount: number;
  hasLibrary: boolean;
}

/**
 * Gate del lobby: mismos criterios que el motor (`start` / setlist vacío /
 * biblioteca de Adivina), para deshabilitar «Empezar show» antes de tirar.
 */
export function canStartShow(input: CanStartShowInput): boolean {
  if (input.playerCount < 2) return false;
  if (input.hasLibrary && input.setlistCount === 0) return false;
  if (input.mode === "guess" && input.guessCatalogCount < 4) return false;
  return true;
}

/** Mensaje para errores de red/Supabase pausado al listar la biblioteca. */
export function libraryLoadErrorMessage(caught: unknown): string {
  const raw = caught instanceof Error ? caught.message : String(caught ?? "");
  const lower = raw.toLowerCase();
  if (
    lower.includes("paused") ||
    lower.includes("inactive") ||
    lower.includes("project not found") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror")
  ) {
    return "No se pudo conectar con Supabase. Si el proyecto está pausado, reactívalo en supabase.com y recarga.";
  }
  return raw.trim() || "No se pudo cargar la biblioteca del grupo.";
}
