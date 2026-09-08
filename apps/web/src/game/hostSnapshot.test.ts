import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultGameConfig, type RoomPublicState } from "@slay-it/shared";
import {
  clearHostSnapshot,
  HOST_SNAPSHOT_KEY,
  readHostSnapshot,
  writeHostSnapshot,
} from "./hostSnapshot";

function minimalState(overrides: Partial<RoomPublicState> = {}): RoomPublicState {
  return {
    code: "AB12",
    hostId: "host-1",
    players: [],
    config: defaultGameConfig,
    phase: "lobby",
    song: null,
    blackout: null,
    singerId: null,
    activeTurnIndex: null,
    round: 0,
    totalRounds: 0,
    countdownEndsAt: null,
    startPosition: 0,
    startedAt: null,
    revealEndsAt: null,
    playbackOffsetMs: 0,
    hostPlayhead: null,
    votes: {},
    lastResult: null,
    starVotes: {},
    lastStars: null,
    relayPlan: null,
    endReason: null,
    hostHasAudio: false,
    hostNow: null,
    selectedSongId: null,
    guessQuestion: null,
    guessAnswers: {},
    guessWindowStartedAt: null,
    guessDeadlineAt: null,
    lastGuessPoints: null,
    songRepeatWarning: false,
    ...overrides,
  };
}

describe("hostSnapshot", () => {
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, String(value));
      },
      removeItem: (key: string) => {
        mem.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("roundtrip conserva código y hostId", () => {
    writeHostSnapshot({
      hostId: "host-1",
      usedSongIds: ["s1"],
      setlistSongIds: ["s1", "s2"],
      state: minimalState(),
    });
    const read = readHostSnapshot();
    expect(read?.hostId).toBe("host-1");
    expect(read?.state.code).toBe("AB12");
    expect(read?.usedSongIds).toEqual(["s1"]);
  });

  it("rechaza JSON inválido", () => {
    sessionStorage.setItem(HOST_SNAPSHOT_KEY, "{nope");
    expect(readHostSnapshot()).toBeNull();
  });

  it("clearHostSnapshot borra la clave", () => {
    writeHostSnapshot({
      hostId: "host-1",
      usedSongIds: [],
      setlistSongIds: null,
      state: minimalState(),
    });
    clearHostSnapshot();
    expect(readHostSnapshot()).toBeNull();
  });
});
