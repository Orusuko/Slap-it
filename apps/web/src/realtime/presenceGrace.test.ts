import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPresenceLeaveGuard, HOST_PRESENCE_GRACE_MS, PRESENCE_GRACE_MS } from "./presenceGrace";

describe("createPresenceLeaveGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no confirma el leave hasta pasar la gracia", () => {
    const confirmed: string[] = [];
    const guard = createPresenceLeaveGuard((id) => confirmed.push(id), PRESENCE_GRACE_MS);
    guard.notifyLeave("p1");
    vi.advanceTimersByTime(PRESENCE_GRACE_MS - 1);
    expect(confirmed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(confirmed).toEqual(["p1"]);
    guard.dispose();
  });

  it("cancela el kick si hay rejoin dentro de la gracia", () => {
    const confirmed: string[] = [];
    const guard = createPresenceLeaveGuard((id) => confirmed.push(id), PRESENCE_GRACE_MS);
    guard.notifyLeave("p1");
    vi.advanceTimersByTime(3_000);
    guard.notifyJoin("p1");
    vi.advanceTimersByTime(PRESENCE_GRACE_MS);
    expect(confirmed).toEqual([]);
    expect(guard.isPending("p1")).toBe(false);
    guard.dispose();
  });

  it("dispose cancela pendientes", () => {
    const confirmed: string[] = [];
    const guard = createPresenceLeaveGuard((id) => confirmed.push(id), PRESENCE_GRACE_MS);
    guard.notifyLeave("p1");
    guard.dispose();
    vi.advanceTimersByTime(PRESENCE_GRACE_MS);
    expect(confirmed).toEqual([]);
  });

  it("la gracia del host es más larga que la del jugador", () => {
    expect(HOST_PRESENCE_GRACE_MS).toBe(20_000);
    expect(HOST_PRESENCE_GRACE_MS).toBeGreaterThan(PRESENCE_GRACE_MS);
  });
});
