import { describe, expect, it } from "vitest";
import { canStartShow, libraryLoadErrorMessage } from "./canStartShow";

describe("canStartShow", () => {
  const base = {
    playerCount: 2,
    mode: "relay" as const,
    guessCatalogCount: 4,
    setlistCount: 3,
    hasLibrary: true,
  };

  it("pide al menos 2 jugadores", () => {
    expect(canStartShow({ ...base, playerCount: 1 })).toBe(false);
    expect(canStartShow(base)).toBe(true);
  });

  it("bloquea setlist vacío cuando hay biblioteca", () => {
    expect(canStartShow({ ...base, setlistCount: 0, hasLibrary: true })).toBe(false);
    expect(canStartShow({ ...base, setlistCount: 0, hasLibrary: false })).toBe(true);
  });

  it("en guess pide al menos 4 canciones", () => {
    expect(canStartShow({ ...base, mode: "guess", guessCatalogCount: 3 })).toBe(false);
    expect(canStartShow({ ...base, mode: "guess", guessCatalogCount: 4 })).toBe(true);
  });
});

describe("libraryLoadErrorMessage", () => {
  it("traduce pausa / red caída", () => {
    expect(libraryLoadErrorMessage(new Error("Failed to fetch"))).toMatch(/pausado/i);
    expect(libraryLoadErrorMessage(new Error("project is paused"))).toMatch(/supabase\.com/i);
  });

  it("deja el mensaje original si no es de red", () => {
    expect(libraryLoadErrorMessage(new Error("permission denied"))).toBe("permission denied");
  });
});
