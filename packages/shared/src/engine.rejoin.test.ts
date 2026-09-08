import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomManager } from "./engine.js";
import { createFixtureSong } from "./testFixtures.js";

function createTestRooms(): RoomManager {
  const rooms = new RoomManager(() => {});
  rooms.registerSongs([createFixtureSong("rejoin-1"), createFixtureSong("rejoin-2")]);
  return rooms;
}

describe("RoomManager · rejoin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("el mismo playerId en lobby no duplica ni tira", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p1", "Ada");
    expect(rooms.get(created.code)!.players.filter((player) => player.id === "p1")).toHaveLength(1);
    rooms.disconnect(created.code, "host");
  });

  it("el mismo playerId en playing no duplica ni tira", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    rooms.startCountdown(created.code, "host");
    vi.advanceTimersByTime(3_000);
    expect(rooms.get(created.code)!.phase).toBe("playing");
    rooms.join(created.code, "p1", "Ada");
    expect(rooms.get(created.code)!.players.filter((player) => player.id === "p1")).toHaveLength(1);
    rooms.disconnect(created.code, "host");
  });

  it("un id nuevo a mitad de partida se reincorpora", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    rooms.join(created.code, "p3", "Kai");
    expect(rooms.get(created.code)!.players.some((player) => player.id === "p3")).toBe(true);
    rooms.disconnect(created.code, "host");
  });

  it("no deja entrar si el show ya terminó", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    rooms.disconnect(created.code, "p2");
    expect(rooms.get(created.code)!.phase).toBe("finished");
    expect(() => rooms.join(created.code, "p3", "Kai")).toThrow("El show ya terminó");
    rooms.disconnect(created.code, "host");
  });
});
