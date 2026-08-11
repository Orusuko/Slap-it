import type { SongLine } from "@slay-it/shared";

/**
 * Motor puro de sincronización por taps: el humano marca cuándo termina cada
 * línea (y empieza la siguiente) mientras suena el audio. Sin esto, timings
 * uniformes se desincronizan; con un tap por verso, quedan alineados al oído.
 *
 * `openIndex` representa la línea actualmente "abierta" (cantándose):
 * - `-1`  → sync no iniciado (nadie ha pulsado "Empezar").
 * - `0..lines.length-1` → esa línea está abierta; su `start` ya quedó fijado.
 * - `lines.length` → todas las líneas cerradas (sync completo).
 */
export interface TapSyncState {
  lines: string[];
  starts: number[];
  ends: (number | null)[];
  openIndex: number;
}

/** Duración mínima forzada de una línea para evitar `start >= end` por taps pegados. */
export const MIN_LINE_DURATION = 0.15;

export function createTapSyncState(lines: string[]): TapSyncState {
  return {
    lines,
    starts: lines.map(() => 0),
    ends: lines.map(() => null),
    openIndex: -1,
  };
}

export function isTapSyncStarted(state: TapSyncState): boolean {
  return state.openIndex !== -1;
}

export function isTapSyncDone(state: TapSyncState): boolean {
  return state.lines.length > 0 && state.openIndex >= state.lines.length;
}

/** Marca el `start` de la primera línea. No-op si ya se inició o no hay líneas. */
export function beginTapSync(state: TapSyncState, atSeconds: number): TapSyncState {
  if (state.lines.length === 0 || state.openIndex !== -1) return state;
  const starts = state.starts.slice();
  starts[0] = Math.max(0, atSeconds);
  return { ...state, starts, openIndex: 0 };
}

function closeOpenLine(state: TapSyncState, atSeconds: number): { starts: number[]; ends: (number | null)[] } {
  const starts = state.starts.slice();
  const ends = state.ends.slice();
  const index = state.openIndex;
  const minEnd = starts[index]! + MIN_LINE_DURATION;
  ends[index] = Math.max(minEnd, atSeconds);
  return { starts, ends };
}

/** Cierra la línea abierta y abre la siguiente (o termina si era la última). */
export function tapNext(state: TapSyncState, atSeconds: number): TapSyncState {
  if (!isTapSyncStarted(state) || isTapSyncDone(state)) return state;
  const { starts, ends } = closeOpenLine(state, atSeconds);
  const nextIndex = state.openIndex + 1;
  if (nextIndex >= state.lines.length) {
    return { ...state, starts, ends, openIndex: state.lines.length };
  }
  starts[nextIndex] = ends[state.openIndex]!;
  return { ...state, starts, ends, openIndex: nextIndex };
}

/** Cierra la línea abierta y termina el sync (ej. al acabar el audio). */
export function finishTapSync(state: TapSyncState, atSeconds: number): TapSyncState {
  if (!isTapSyncStarted(state) || isTapSyncDone(state)) return state;
  const { starts, ends } = closeOpenLine(state, atSeconds);
  return { ...state, starts, ends, openIndex: state.lines.length };
}

/** Deshace el último tap: reabre la línea anterior para volver a marcarla. */
export function undoTapSync(state: TapSyncState): TapSyncState {
  if (state.openIndex <= -1) return state;
  if (isTapSyncDone(state)) {
    const lastIndex = state.lines.length - 1;
    const ends = state.ends.slice();
    ends[lastIndex] = null;
    return { ...state, ends, openIndex: lastIndex };
  }
  if (state.openIndex === 0) {
    return { ...state, openIndex: -1 };
  }
  const previousIndex = state.openIndex - 1;
  const ends = state.ends.slice();
  ends[previousIndex] = null;
  return { ...state, ends, openIndex: previousIndex };
}

export function restartTapSync(state: TapSyncState): TapSyncState {
  return createTapSyncState(state.lines);
}

/** Construye las `SongLine[]` finales; solo válido cuando `isTapSyncDone`. */
export function buildLinesFromTapSync(state: TapSyncState, idPrefix: string): SongLine[] {
  if (!isTapSyncDone(state)) {
    throw new Error("La sincronización no está completa todavía");
  }
  const sectionId = `${idPrefix}-section-1`;
  return state.lines.map((text, index) => ({
    id: `${idPrefix}-line-${index + 1}`,
    start: Number(state.starts[index]!.toFixed(2)),
    end: Number(state.ends[index]!.toFixed(2)),
    text,
    sectionId,
  }));
}
