import { describe, expect, it } from "vitest";
import {
  formatTurnSectionsLabel,
  getCurrentTurn,
  getNextVisibleTurn,
  planRelay,
  reassignRelayFrom,
  relayStartPosition,
  resolveTurnTimes,
} from "./relay.js";
import { createFixtureSong } from "./testFixtures.js";

const song = createFixtureSong("fixture-relay");
const fourPlayers = ["p1", "p2", "p3", "p4"];

describe("planRelay", () => {
  it("da 2 vueltas completas a 4 jugadores antes de la sorpresa (canción con estrofas de sobra)", () => {
    const plan = planRelay(song, fourPlayers, () => 0);
    expect(plan.roundsCompleted).toBe(2);
    const normal = plan.turns.filter((turn) => turn.kind === "normal");
    const blackout = plan.turns.filter((turn) => turn.kind === "blackout");
    expect(blackout).toHaveLength(1);
    expect(normal.length).toBeGreaterThanOrEqual(fourPlayers.length * 2);
    for (let index = 0; index < fourPlayers.length * 2; index += 1) {
      expect(normal[index]!.playerId).toBe(fourPlayers[index % fourPlayers.length]);
    }
  });

  it("nunca revela la sorpresa antes de tiempo: el turno de apagón es siempre el último", () => {
    const plan = planRelay(song, fourPlayers, () => 0.9);
    expect(plan.turns.at(-1)!.kind).toBe("blackout");
    expect(plan.turns.slice(0, -1).every((turn) => turn.kind === "normal")).toBe(true);
  });

  it("cada turno usa entre 1 y 4 estrofas y no repite ninguna", () => {
    const plan = planRelay(song, fourPlayers, () => 0.5);
    const seen = new Set<string>();
    for (const turn of plan.turns) {
      expect(turn.sectionIds.length).toBeGreaterThanOrEqual(1);
      expect(turn.sectionIds.length).toBeLessThanOrEqual(4);
      for (const id of turn.sectionIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it("degrada con gracia cuando hay pocos jugadores respecto al contenido disponible", () => {
    const plan = planRelay(song, ["a", "b"], () => 0);
    expect(plan.roundsCompleted).toBeGreaterThanOrEqual(1);
    expect(plan.turns.at(-1)!.kind).toBe("blackout");
  });

  it("siempre entrega un plan usable incluso con muchos jugadores", () => {
    const eightPlayers = Array.from({ length: 8 }, (_, index) => `p${index}`);
    const plan = planRelay(song, eightPlayers, () => 0.3);
    expect(plan.turns.length).toBeGreaterThan(0);
    expect(plan.turns.at(-1)!.kind).toBe("blackout");
  });
});

describe("etiquetas y siguiente turno", () => {
  it("formatea el rango de estrofas del turno", () => {
    const plan = planRelay(song, fourPlayers, () => 0);
    const first = plan.turns[0]!;
    const label = formatTurnSectionsLabel(song, first);
    expect(label).toMatch(/^Estrofa/);
    expect(label).toContain(`(${first.sectionIds.length})`);
  });

  it("no revela el siguiente si es blackout y el actual es normal", () => {
    const plan = planRelay(song, fourPlayers, () => 0);
    const beforeBlackout = plan.turns.at(-2)!;
    expect(beforeBlackout.kind).toBe("normal");
    expect(getNextVisibleTurn(plan, beforeBlackout)).toBeNull();
  });

  it("sí revela el siguiente cuando el actual ya es blackout o el siguiente es normal", () => {
    const plan = planRelay(song, fourPlayers, () => 0);
    const first = plan.turns[0]!;
    const second = plan.turns[1]!;
    if (second.kind === "normal") {
      expect(getNextVisibleTurn(plan, first)?.index).toBe(second.index);
    }
    expect(getNextVisibleTurn(plan, plan.turns.at(-1)!)).toBeNull();
  });
});

describe("reassignRelayFrom", () => {
  it("reasigna solo desde fromIndex y deja un único blackout", () => {
    const plan = planRelay(song, fourPlayers, () => 0);
    const remaining = ["p1", "p3"];
    const next = reassignRelayFrom(plan, 2, remaining);
    expect(next.turns.slice(0, 2).map((turn) => turn.playerId)).toEqual(
      plan.turns.slice(0, 2).map((turn) => turn.playerId),
    );
    expect(next.turns.slice(2).every((turn) => remaining.includes(turn.playerId))).toBe(true);
    expect(next.turns.filter((turn) => turn.kind === "blackout")).toHaveLength(1);
  });
});

describe("getCurrentTurn / resolveTurnTimes", () => {
  it("ubica el turno correcto según la posición de reproducción", () => {
    const plan = planRelay(song, fourPlayers, () => 0);
    const first = plan.turns[0]!;
    const start = relayStartPosition(song, plan);
    expect(getCurrentTurn(plan, song, start)?.index).toBe(first.index);

    const last = plan.turns.at(-1)!;
    const { end } = resolveTurnTimes(song, last);
    expect(getCurrentTurn(plan, song, end + 1)?.index).toBe(last.index);
  });
});
