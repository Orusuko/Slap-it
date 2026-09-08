import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPlayerSession, readPlayerSession, writePlayerSession } from "./playerSession";

describe("playerSession", () => {
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    vi.stubGlobal("localStorage", {
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
    clearPlayerSession();
    vi.unstubAllGlobals();
  });

  it("roundtrip guarda código en mayúsculas", () => {
    writePlayerSession({ code: "ab12", playerId: "p1", name: " Ada " });
    expect(readPlayerSession()).toEqual({ code: "AB12", playerId: "p1", name: "Ada" });
  });

  it("rechaza JSON inválido", () => {
    localStorage.setItem("slay-it-player-session", "{nope");
    expect(readPlayerSession()).toBeNull();
  });
});
