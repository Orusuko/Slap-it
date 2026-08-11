import type {
  BlackoutSelection,
  GameConfig,
  RoomPublicState,
  Song,
  SongLine,
} from "./model.js";

export function maskLyrics(text: string): string {
  return text.replace(/[\p{L}\p{N}]+/gu, (word) => word[0] + "_".repeat(word.length - 1));
}

export function getCurrentLine(song: Song, timeSeconds: number): SongLine | null {
  return (
    song.lines.find((line) => timeSeconds >= line.start && timeSeconds < line.end) ?? null
  );
}

export function getPlaybackPosition(
  state: Pick<RoomPublicState, "startPosition" | "startedAt" | "playbackOffsetMs">,
  now = Date.now(),
): number {
  if (state.startedAt === null) return state.startPosition;
  return Math.max(
    0,
    state.startPosition +
      (now - state.startedAt) / 1_000 +
      state.playbackOffsetMs / 1_000,
  );
}

export function selectStartPosition(
  song: Song,
  blackout: BlackoutSelection,
  contextSeconds = 5,
): number {
  const section = song.sections.find(({ id }) => id === blackout.sectionIds[0]);
  const latestWithContext = Math.max(0, blackout.start - contextSeconds);
  const preferredStarts = [section?.start, song.chorusStart].filter(
    (position): position is number =>
      position !== undefined && position <= latestWithContext,
  );
  return Math.max(0, preferredStarts[0] ?? latestWithContext);
}

/** Canciones de borrador / plantilla: no entran al pool de fiesta por defecto. */
export function isPlaceholderSong(song: Pick<Song, "id" | "title">): boolean {
  return song.id.startsWith("placeholder-") || song.title.startsWith("PLACEHOLDER");
}

export function selectSong(
  songs: readonly Song[],
  excludedIds: readonly string[] = [],
  random: () => number = Math.random,
): Song {
  const notExcluded = songs.filter((song) => !excludedIds.includes(song.id));
  const partyPool = notExcluded.filter((song) => !isPlaceholderSong(song));
  // Preferir demos/reales; solo cae a placeholders si no queda otra opción.
  const pool =
    partyPool.length > 0
      ? partyPool
      : notExcluded.length > 0
        ? notExcluded
        : songs.filter((song) => !isPlaceholderSong(song));
  const fallback = pool.length > 0 ? pool : [...songs];
  if (fallback.length === 0) throw new Error("No hay canciones disponibles");
  return fallback[Math.min(fallback.length - 1, Math.floor(random() * fallback.length))]!;
}

export function selectBlackout(
  song: Song,
  duration: GameConfig["blackoutDuration"],
  random: () => number = Math.random,
): BlackoutSelection {
  const safeEnd = song.duration - 5;
  const nearbySections = song.sections.filter(
    (section) =>
      section.end <= safeEnd &&
      Math.abs(section.start - song.chorusStart) <= Math.max(18, song.duration * 0.3),
  );
  const sectionPool = nearbySections.length > 0
    ? nearbySections
    : song.sections.filter((section) => section.end <= safeEnd);
  const pool = sectionPool.length > 0 ? sectionPool : song.sections.slice(0, -1);
  const ranked = [...(pool.length > 0 ? pool : song.sections)].sort(
    (a, b) => Math.abs(a.start - song.chorusStart) - Math.abs(b.start - song.chorusStart),
  );
  const candidates = ranked.slice(0, Math.min(3, ranked.length));
  const section = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]!;
  const lines = song.lines.filter((line) => section.lineIds.includes(line.id));

  if (duration === "section") {
    return {
      sectionIds: [section.id],
      lineIds: lines.map((line) => line.id),
      start: section.start,
      end: section.end,
    };
  }

  const line = lines[Math.min(lines.length - 1, Math.floor(random() * lines.length))]!;
  return {
    sectionIds: [section.id],
    lineIds: [line.id],
    start: line.start,
    end: line.end,
  };
}
