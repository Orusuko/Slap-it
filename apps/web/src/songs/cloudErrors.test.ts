import { describe, expect, it } from "vitest";
import { isDuplicateSongError, isSignedUrlExpired } from "./cloudErrors";

describe("isDuplicateSongError", () => {
  it("detecta conflicto de id de Postgres", () => {
    expect(isDuplicateSongError({ message: "duplicate key value", code: "23505" })).toBe(true);
    expect(isDuplicateSongError(new Error("already exists"))).toBe(true);
    expect(isDuplicateSongError(new Error("permission denied"))).toBe(false);
  });
});

describe("isSignedUrlExpired", () => {
  it("trata 400/403 y mensajes de firma como caducados", () => {
    expect(isSignedUrlExpired({ status: 403 })).toBe(true);
    expect(isSignedUrlExpired({ status: 400 })).toBe(true);
    expect(isSignedUrlExpired(new Error("JWT expired"))).toBe(true);
    expect(isSignedUrlExpired(new Error("network down"))).toBe(false);
  });
});
