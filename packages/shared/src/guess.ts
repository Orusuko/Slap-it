import { isPlaceholderSong } from "./game.js";
import type { GuessQuestion, RoomPublicState, Song } from "./model.js";

export const GUESS_CLIP_SECONDS = 10;
export const GUESS_OPTION_COUNT = 4;
export const GUESS_MAX_POINTS = 1000;
export const GUESS_MIN_POINTS = 500;
export const GUESS_ANSWER_WINDOW_MS = 15_000;
export const GUESS_REVEAL_MS = 4_000;

const GUESS_LIBRARY_ERROR =
  "Se necesitan al menos 4 canciones en la biblioteca para Adivina la canción.";

const HIDDEN_GUESS_PHASES = new Set(["ready", "countdown", "playing", "voting"]);

export function selectGuessClip(
  song: Pick<Song, "chorusStart" | "duration">,
): { clipStart: number; clipEnd: number } {
  if (song.chorusStart + GUESS_CLIP_SECONDS <= song.duration) {
    return {
      clipStart: song.chorusStart,
      clipEnd: song.chorusStart + GUESS_CLIP_SECONDS,
    };
  }
  const clipStart = Math.max(0, song.duration - GUESS_CLIP_SECONDS);
  return { clipStart, clipEnd: song.duration };
}

export function guessOptionLabel(
  song: Pick<Song, "title" | "artist">,
  siblings: Array<Pick<Song, "title">>,
): string {
  const collision = siblings.some((sibling) => sibling.title === song.title);
  return collision ? `${song.title} — ${song.artist}` : song.title;
}

export function buildGuessQuestion(
  correct: Song,
  pool: Song[],
  random: () => number = Math.random,
): GuessQuestion {
  const distractorPool = pool.filter(
    (song) => song.id !== correct.id && !isPlaceholderSong(song),
  );
  if (distractorPool.length < GUESS_OPTION_COUNT - 1) {
    throw new Error(GUESS_LIBRARY_ERROR);
  }

  const sameGenre = distractorPool.filter((song) => song.genre === correct.genre);
  const otherGenre = distractorPool.filter((song) => song.genre !== correct.genre);
  const ranked = [...shuffle(sameGenre, random), ...shuffle(otherGenre, random)];
  const distractors = ranked.slice(0, GUESS_OPTION_COUNT - 1);
  const chosen = [correct, ...distractors];
  const options = shuffle(chosen, random).map((song) => ({
    id: song.id,
    label: guessOptionLabel(
      song,
      chosen.filter((sibling) => sibling.id !== song.id),
    ),
  }));
  const clip = selectGuessClip(correct);

  return {
    options,
    correctOptionId: correct.id,
    clipStart: clip.clipStart,
    clipEnd: clip.clipEnd,
  };
}

export function scoreGuessAnswer(
  correct: boolean,
  answeredAt: number,
  windowStartedAt: number,
  windowMs: number = GUESS_ANSWER_WINDOW_MS,
): number {
  if (!correct) return 0;
  const elapsed = Math.min(Math.max(0, answeredAt - windowStartedAt), windowMs);
  return Math.round(
    GUESS_MAX_POINTS - (elapsed / windowMs) * (GUESS_MAX_POINTS - GUESS_MIN_POINTS),
  );
}

export function sanitizeGuessState(state: RoomPublicState): RoomPublicState {
  if (state.config.mode !== "guess" || !HIDDEN_GUESS_PHASES.has(state.phase)) {
    return state;
  }
  const clone = structuredClone(state);
  if (clone.song) {
    clone.song = {
      ...clone.song,
      title: "???",
      artist: "???",
      lines: clone.song.lines.map((line) => ({ ...line, text: " " })),
    };
  }
  if (clone.guessQuestion) {
    clone.guessQuestion = { ...clone.guessQuestion, correctOptionId: "" };
  }
  return clone;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index]!;
    result[index] = result[swapIndex]!;
    result[swapIndex] = current;
  }
  return result;
}
