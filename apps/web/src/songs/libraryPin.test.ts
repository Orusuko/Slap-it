import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { libraryPinRequired, libraryPinUnlocked, unlockLibraryPin } from "./libraryPin";

describe("libraryPin", () => {
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

  it("no exige PIN si no hay valor configurado", () => {
    expect(libraryPinRequired("")).toBe(false);
    expect(unlockLibraryPin("cualquier", "")).toBe(true);
  });

  it("guarda el desbloqueo en sessionStorage si el PIN coincide", () => {
    expect(libraryPinRequired("fiesta")).toBe(true);
    expect(libraryPinUnlocked()).toBe(false);
    expect(unlockLibraryPin("mal", "fiesta")).toBe(false);
    expect(unlockLibraryPin("fiesta", "fiesta")).toBe(true);
    expect(libraryPinUnlocked()).toBe(true);
  });
});
