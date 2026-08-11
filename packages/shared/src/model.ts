import { z } from "zod";

export const sectionTypeSchema = z.enum([
  "intro",
  "verse",
  "prechorus",
  "chorus",
  "bridge",
  "outro",
]);

export const songLineSchema = z.object({
  id: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  text: z.string().min(1),
  sectionId: z.string().min(1),
});

export const songSectionSchema = z.object({
  id: z.string().min(1),
  type: sectionTypeSchema,
  start: z.number().nonnegative(),
  end: z.number().positive(),
  lineIds: z.array(z.string().min(1)).min(1),
});

export const songSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    artist: z.string().min(1),
    duration: z.number().positive(),
    genre: z.string().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]),
    chorusStart: z.number().nonnegative(),
    sections: z.array(songSectionSchema).min(1),
    lines: z.array(songLineSchema).min(1),
    audioSource: z
      .union([
        z.object({
          type: z.literal("local"),
          path: z.string().min(1),
        }),
        // Canción subida por un jugador (wizard "Sube tu canción"): el audio
        // vive como blob en IndexedDB de ese dispositivo, no en `public/`.
        z.object({
          type: z.literal("user"),
        }),
      ])
      .optional(),
  })
  .superRefine((song, context) => {
    const sectionIds = new Set(song.sections.map((section) => section.id));
    const lineIds = new Set(song.lines.map((line) => line.id));
    if (sectionIds.size !== song.sections.length || lineIds.size !== song.lines.length) {
      context.addIssue({ code: "custom", message: "Los IDs deben ser únicos" });
    }
    if (song.chorusStart >= song.duration) {
      context.addIssue({ code: "custom", message: "El estribillo debe comenzar dentro de la canción" });
    }
    for (const section of song.sections) {
      if (section.start >= section.end || section.end > song.duration) {
        context.addIssue({ code: "custom", message: `Sección inválida: ${section.id}` });
      }
      for (const lineId of section.lineIds) {
        if (!lineIds.has(lineId)) {
          context.addIssue({ code: "custom", message: `Línea inexistente: ${lineId}` });
        }
      }
    }
    for (const line of song.lines) {
      if (line.start >= line.end || line.end > song.duration || !sectionIds.has(line.sectionId)) {
        context.addIssue({ code: "custom", message: `Línea inválida: ${line.id}` });
      }
      const section = song.sections.find((item) => item.id === line.sectionId);
      if (
        !section ||
        !section.lineIds.includes(line.id) ||
        line.start < section.start ||
        line.end > section.end
      ) {
        context.addIssue({ code: "custom", message: `Línea fuera de su sección: ${line.id}` });
      }
    }
  });

export type Song = z.infer<typeof songSchema>;
export type SongLine = z.infer<typeof songLineSchema>;
export type SongSection = z.infer<typeof songSectionSchema>;

export const gameConfigSchema = z.object({
  maxPlayers: z.number().int().min(2).max(8),
  mode: z.enum(["individual", "relay"]),
  blackoutDuration: z.enum(["line", "section"]),
  mask: z.enum(["total", "partial"]),
  groupVoting: z.boolean(),
});

export type GameConfig = z.infer<typeof gameConfigSchema>;
export const defaultGameConfig: GameConfig = {
  maxPlayers: 8,
  mode: "relay",
  blackoutDuration: "section",
  mask: "total",
  groupVoting: true,
};

export const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(24),
  score: z.number().int().nonnegative(),
});

export type Player = z.infer<typeof playerSchema>;
export type GamePhase =
  | "lobby"
  | "ready"
  | "countdown"
  | "playing"
  | "reveal"
  | "voting"
  | "score"
  | "finished";

/** Motivo de cierre de la partida (pantalla Finished). */
export type EndReason = "completed" | "not_enough_players";

export interface BlackoutSelection {
  sectionIds: string[];
  lineIds: string[];
  start: number;
  end: number;
}

/** Un turno del modo relevo: quién canta y qué estrofas le tocan. */
export interface RelayTurn {
  index: number;
  round: number;
  playerId: string;
  sectionIds: string[];
  kind: "normal" | "blackout";
}

/** Reparto completo de turnos de una ronda de relevo, calculado al iniciarla. */
export interface RelayPlan {
  startSectionIndex: number;
  roundsCompleted: number;
  turns: RelayTurn[];
}

export interface RoomPublicState {
  code: string;
  hostId: string;
  players: Player[];
  config: GameConfig;
  phase: GamePhase;
  song: Song | null;
  blackout: BlackoutSelection | null;
  /**
   * Jugador juzgado al terminar el apagón (voto / +1).
   * En modo individual es quien canta la ronda.
   * En modo relevo es quien tiene el turno `blackout` (no el turno normal vigente).
   */
  singerId: string | null;
  /**
   * Índice del turno de relevo vigente durante `playing` (y el primero en ready/countdown).
   * null en modo individual o sin plan.
   */
  activeTurnIndex: number | null;
  round: number;
  totalRounds: number;
  countdownEndsAt: number | null;
  /** Posición absoluta de la canción al comenzar la reproducción. */
  startPosition: number;
  /** Instante del servidor en que comenzó la reproducción desde startPosition. */
  startedAt: number | null;
  revealEndsAt: number | null;
  /** Ajuste acumulado sobre el tiempo derivado; no modifica startedAt. */
  playbackOffsetMs: number;
  votes: Record<string, boolean>;
  lastResult: boolean | null;
  /** Reparto de turnos vigente cuando `config.mode === "relay"`; null en modo individual. */
  relayPlan: RelayPlan | null;
  /** null mientras la partida sigue; se rellena al pasar a `finished`. */
  endReason: EndReason | null;
  /** true si el anfitrión tiene audio in-app listo (catálogo o adjunto). */
  hostHasAudio: boolean;
  /**
   * Reloj del host en el momento del broadcast (`Date.now()`).
   * Los clientes estiman offset: `hostNow - Date.now()` para alinear la letra.
   */
  hostNow: number | null;
  /**
   * Canción elegida por el host en el lobby (`null` = sorteo aleatorio
   * excluyendo placeholders).
   */
  selectedSongId: string | null;
}
