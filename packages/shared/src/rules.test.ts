import { describe, expect, it } from "vitest";
import { resolveMajority } from "./rules.js";

describe("reglas de la partida", () => {
  it("requiere mayoría afirmativa estricta", () => {
    expect(resolveMajority({ a: true, b: true, c: false })).toBe(true);
    expect(resolveMajority({ a: true, b: false })).toBe(false);
  });
});
