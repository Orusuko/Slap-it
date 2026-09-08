import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomManager } from "./engine.js";
import { createFixtureSong } from "./testFixtures.js";

function createTestRooms(): RoomManager {
  const rooms = new RoomManager(() => {});
  rooms.registerSongs([createFixtureSong("restore-1"), createFixtureSong("restore-2")]);
  return rooms;
}

describe("RoomManager · restore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("restore en lobby conserva code y jugadores", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    const snapshot = rooms.exportSnapshot(created.code)!;
    rooms.disconnect(created.code, "host");
    expect(rooms.get(created.code)).toBeUndefined();

    const restored = createTestRooms();
    restored.restore(snapshot);
    expect(restored.get(created.code)!.code).toBe(created.code);
    expect(restored.get(created.code)!.players.map((player) => player.id)).toEqual(["p1", "p2"]);
    expect(restored.get(created.code)!.phase).toBe("lobby");
    restored.disconnect(created.code, "host");
  });

  it("restore en playing conserva startedAt y hostPlayhead", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.setHostHasAudio(created.code, "host", true);
    rooms.start(created.code, "host");
    rooms.startCountdown(created.code, "host");
    vi.advanceTimersByTime(3_000);
    rooms.hostConfirmPlaybackStarted(created.code, "host", 12.5);
    const playing = rooms.get(created.code)!;
    expect(playing.phase).toBe("playing");
    const startedAt = playing.startedAt;
    const snapshot = rooms.exportSnapshot(created.code)!;
    rooms.disconnect(created.code, "host");

    vi.advanceTimersByTime(2_000);
    const restored = createTestRooms();
    restored.restore(snapshot);
    const next = restored.get(created.code)!;
    expect(next.phase).toBe("playing");
    expect(next.startedAt).toBe(startedAt);
    expect(next.hostPlayhead).toBe(12.5);
    restored.disconnect(created.code, "host");
  });

  it("resetToLobby conserva código y jugadores con score 0", () => {
    const rooms = createTestRooms();
    const created = rooms.create("host", "TV");
    rooms.join(created.code, "p1", "Ada");
    rooms.join(created.code, "p2", "Lin");
    rooms.start(created.code, "host");
    rooms.resetToLobby(created.code, "host");
    const lobby = rooms.get(created.code)!;
    expect(lobby.phase).toBe("lobby");
    expect(lobby.code).toBe(created.code);
    expect(lobby.players.map((player) => player.score)).toEqual([0, 0]);
    expect(lobby.song).toBeNull();
    rooms.disconnect(created.code, "host");
  });
});
