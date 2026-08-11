import { describe, expect, it } from "vitest";
import {
  beginTapSync,
  buildLinesFromTapSync,
  createTapSyncState,
  finishTapSync,
  isTapSyncDone,
  isTapSyncStarted,
  restartTapSync,
  tapNext,
  undoTapSync,
} from "./tapSync";

const LINES = ["Uno", "Dos", "Tres"];

describe("tapSync", () => {
  it("empieza sin iniciar y sin líneas cerradas", () => {
    const state = createTapSyncState(LINES);
    expect(isTapSyncStarted(state)).toBe(false);
    expect(isTapSyncDone(state)).toBe(false);
  });

  it("begin fija el start de la primera línea y la abre", () => {
    const state = beginTapSync(createTapSyncState(LINES), 2);
    expect(isTapSyncStarted(state)).toBe(true);
    expect(state.openIndex).toBe(0);
    expect(state.starts[0]).toBe(2);
  });

  it("begin es no-op si ya se inició", () => {
    const started = beginTapSync(createTapSyncState(LINES), 2);
    const again = beginTapSync(started, 99);
    expect(again).toBe(started);
  });

  it("tapNext cierra la actual y abre la siguiente en el mismo instante", () => {
    let state = createTapSyncState(LINES);
    state = beginTapSync(state, 0);
    state = tapNext(state, 3);
    expect(state.ends[0]).toBe(3);
    expect(state.starts[1]).toBe(3);
    expect(state.openIndex).toBe(1);
    expect(isTapSyncDone(state)).toBe(false);
  });

  it("tapNext en la última línea termina el sync", () => {
    let state = createTapSyncState(LINES);
    state = beginTapSync(state, 0);
    state = tapNext(state, 3);
    state = tapNext(state, 6);
    state = tapNext(state, 9);
    expect(isTapSyncDone(state)).toBe(true);
    expect(state.ends[2]).toBe(9);
  });

  it("fuerza una duración mínima si el tap llega demasiado pronto", () => {
    let state = createTapSyncState(LINES);
    state = beginTapSync(state, 5);
    state = tapNext(state, 5.01);
    expect(state.ends[0]).toBeGreaterThanOrEqual(5.15);
  });

  it("finishTapSync cierra la línea abierta aunque no sea la última", () => {
    let state = createTapSyncState(LINES);
    state = beginTapSync(state, 0);
    state = tapNext(state, 3);
    state = finishTapSync(state, 5);
    expect(isTapSyncDone(state)).toBe(true);
    expect(state.ends[1]).toBe(5);
  });

  it("undo tras el primer tap regresa a no iniciado", () => {
    let state = createTapSyncState(LINES);
    state = beginTapSync(state, 0);
    state = undoTapSync(state);
    expect(isTapSyncStarted(state)).toBe(false);
  });

  it("undo reabre la línea anterior en medio del sync", () => {
    let state = createTapSyncState(LINES);
    state = beginTapSync(state, 0);
    state = tapNext(state, 3);
    state = undoTapSync(state);
    expect(state.openIndex).toBe(0);
    expect(state.ends[0]).toBeNull();
  });

  it("undo tras terminar reabre la última línea", () => {
    let state = createTapSyncState(LINES);
    state = beginTapSync(state, 0);
    state = tapNext(state, 3);
    state = tapNext(state, 6);
    state = tapNext(state, 9);
    state = undoTapSync(state);
    expect(isTapSyncDone(state)).toBe(false);
    expect(state.openIndex).toBe(2);
    expect(state.ends[2]).toBeNull();
  });

  it("restart limpia todo el progreso", () => {
    let state = createTapSyncState(LINES);
    state = beginTapSync(state, 0);
    state = tapNext(state, 3);
    state = restartTapSync(state);
    expect(isTapSyncStarted(state)).toBe(false);
    expect(state.ends.every((end) => end === null)).toBe(true);
  });

  it("buildLinesFromTapSync produce SongLine[] válidos solo si está completo", () => {
    let state = createTapSyncState(LINES);
    expect(() => buildLinesFromTapSync(state, "custom-1")).toThrow();
    state = beginTapSync(state, 0);
    state = tapNext(state, 3);
    state = tapNext(state, 6);
    state = tapNext(state, 9);
    const lines = buildLinesFromTapSync(state, "custom-1");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ id: "custom-1-line-1", start: 0, end: 3, text: "Uno", sectionId: "custom-1-section-1" });
    for (const line of lines) expect(line.start).toBeLessThan(line.end);
  });
});
