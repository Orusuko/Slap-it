import { describe, expect, it } from "vitest";
import { parseLyrics } from "./parseLyrics";

describe("parseLyrics", () => {
  it("divide por líneas y descarta vacías", () => {
    expect(parseLyrics("Uno\n\nDos\n   \nTres")).toEqual(["Uno", "Dos", "Tres"]);
  });

  it("recorta espacios al inicio y final", () => {
    expect(parseLyrics("  Hola mundo  \n  Otra línea")).toEqual(["Hola mundo", "Otra línea"]);
  });

  it("soporta saltos de línea CRLF", () => {
    expect(parseLyrics("Uno\r\nDos\r\nTres")).toEqual(["Uno", "Dos", "Tres"]);
  });

  it("quita timestamps LRC con corchetes", () => {
    expect(parseLyrics("[00:12.34] Yo soy el aventurero\n[01:02] El mundo me importa poco")).toEqual([
      "Yo soy el aventurero",
      "El mundo me importa poco",
    ]);
  });

  it("quita timestamps sin corchetes al inicio", () => {
    expect(parseLyrics("00:12 - Yo soy el aventurero")).toEqual(["Yo soy el aventurero"]);
  });

  it("no toca texto sin timestamp", () => {
    expect(parseLyrics("Me gustan las altas y las chaparritas")).toEqual([
      "Me gustan las altas y las chaparritas",
    ]);
  });

  it("devuelve vacío para texto en blanco", () => {
    expect(parseLyrics("   \n\n  ")).toEqual([]);
  });
});
