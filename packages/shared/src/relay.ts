import type { RelayPlan, RelayTurn, Song } from "./model.js";

/**
 * Reparte las estrofas de una canción entre los jugadores para el modo
 * relevo con sorpresa:
 *
 * 1. Arranca en una sección al azar (deja margen para completar el plan).
 * 2. Reparte turnos de 1-4 estrofas siguiendo el orden de la lista de
 *    jugadores, dando al menos 2 vueltas completas cuando la canción lo
 *    permite (si no alcanza, hace lo que pueda con 1 vuelta).
 * 3. Tras esas vueltas, deja pasar 0 a (jugadores-1) turnos extra al azar
 *    y entonces asigna el turno "sorpresa": a ese jugador se le apagará la
 *    letra en la 1-2 estrofas finales del reparto.
 */
export function planRelay(
  song: Song,
  playerIds: readonly string[],
  random: () => number = Math.random,
): RelayPlan {
  const n = playerIds.length;
  if (n === 0) return { startSectionIndex: 0, roundsCompleted: 0, turns: [] };

  const sections = song.sections;
  const total = sections.length;
  const minPool = n + 1;
  const maxStart = Math.max(0, total - minPool);
  const startSectionIndex = maxStart > 0 ? Math.floor(random() * (maxStart + 1)) : 0;
  const pool = sections.slice(startSectionIndex);
  const available = pool.length;

  if (available < n + 1) {
    const turns: RelayTurn[] = playerIds.map((playerId, index) => ({
      index,
      round: 1,
      playerId,
      sectionIds: [pool[Math.min(index, available - 1)]!.id],
      kind: index === playerIds.length - 1 ? "blackout" : "normal",
    }));
    return { startSectionIndex, roundsCompleted: 1, turns };
  }

  const roundsCompleted = Math.max(1, Math.min(2, Math.floor((available - 1) / n)));
  const maxExtra = Math.max(0, Math.min(n - 1, available - roundsCompleted * n - 1));
  const extraTurns = maxExtra > 0 ? Math.floor(random() * (maxExtra + 1)) : 0;
  const totalNormalTurns = roundsCompleted * n + extraTurns;
  const blackoutSize = Math.max(1, Math.min(2, available - totalNormalTurns));

  const turns: RelayTurn[] = [];
  let cursor = 0;
  for (let index = 0; index < totalNormalTurns; index += 1) {
    const round = Math.floor(index / n) + 1;
    const playerId = playerIds[index % n]!;
    const remainingMandatory = totalNormalTurns - index - 1;
    const maxTakeable = Math.max(1, available - cursor - remainingMandatory - blackoutSize);
    const size = Math.min(4, maxTakeable, Math.floor(random() * 4) + 1);
    const sectionIds = pool.slice(cursor, cursor + size).map((section) => section.id);
    turns.push({ index, round, playerId, sectionIds, kind: "normal" });
    cursor += size;
  }

  const blackoutSections = pool.slice(cursor, cursor + blackoutSize);
  turns.push({
    index: totalNormalTurns,
    round: Math.floor(totalNormalTurns / n) + 1,
    playerId: playerIds[totalNormalTurns % n]!,
    sectionIds: (blackoutSections.length > 0 ? blackoutSections : [pool[available - 1]!]).map(
      (section) => section.id,
    ),
    kind: "blackout",
  });

  return { startSectionIndex, roundsCompleted, turns };
}

export function resolveTurnTimes(song: Song, turn: RelayTurn): { start: number; end: number } {
  const sections = turn.sectionIds
    .map((id) => song.sections.find((section) => section.id === id))
    .filter((section): section is NonNullable<typeof section> => Boolean(section));
  if (sections.length === 0) return { start: 0, end: song.duration };
  return {
    start: Math.min(...sections.map((section) => section.start)),
    end: Math.max(...sections.map((section) => section.end)),
  };
}

/** Turno vigente para una posición de reproducción dada (o el último si ya terminaron todos). */
export function getCurrentTurn(plan: RelayPlan, song: Song, position: number): RelayTurn | null {
  if (plan.turns.length === 0) return null;
  for (const turn of plan.turns) {
    if (position < resolveTurnTimes(song, turn).end) return turn;
  }
  return plan.turns[plan.turns.length - 1]!;
}

export function relayStartPosition(song: Song, plan: RelayPlan): number {
  const firstTurn = plan.turns[0];
  return firstTurn ? resolveTurnTimes(song, firstTurn).start : 0;
}

/** Números 1-based de las secciones del turno dentro de la canción. */
export function turnSectionNumbers(song: Song, turn: RelayTurn): number[] {
  return turn.sectionIds
    .map((id) => song.sections.findIndex((section) => section.id === id) + 1)
    .filter((number) => number > 0);
}

/** Etiqueta tipo "Estrofas 9–11 (3)" o "Estrofa 9 (1)". */
export function formatTurnSectionsLabel(song: Song, turn: RelayTurn): string {
  const numbers = turnSectionNumbers(song, turn);
  const count = turn.sectionIds.length;
  if (numbers.length === 0) return `${count} estrofa${count === 1 ? "" : "s"}`;
  const first = numbers[0]!;
  const last = numbers[numbers.length - 1]!;
  if (first === last) return `Estrofa ${first} (${count})`;
  return `Estrofas ${first}–${last} (${count})`;
}

/**
 * Siguiente turno visible sin spoilear el blackout.
 * Si el siguiente es blackout y el actual aún es normal, no lo revela.
 */
export function getNextVisibleTurn(plan: RelayPlan, current: RelayTurn | null): RelayTurn | null {
  if (!current) return null;
  const next = plan.turns[current.index + 1];
  if (!next) return null;
  if (next.kind === "blackout" && current.kind === "normal") return null;
  return next;
}

/**
 * Reasigna los turnos desde `fromIndex` (inclusive) entre los jugadores
 * restantes, preservando secciones y el blackout como último turno.
 * Trade-off: más estable que regenerar el plan completo a mitad de canción
 * (no mueve timestamps ni startPosition).
 */
export function reassignRelayFrom(
  plan: RelayPlan,
  fromIndex: number,
  playerIds: readonly string[],
): RelayPlan {
  if (playerIds.length === 0) return { ...plan, turns: [] };
  const turns = plan.turns.map((turn) => {
    if (turn.index < fromIndex) return turn;
    const offset = turn.index - fromIndex;
    return { ...turn, playerId: playerIds[offset % playerIds.length]! };
  });
  return { ...plan, turns };
}
