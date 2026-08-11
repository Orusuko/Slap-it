import { describe, expect, it, vi } from "vitest";
import { probeAudioUrl } from "./useHostAudio";

function mockAudio(trigger: "loadeddata" | "error" | "timeout") {
  const listeners = new Map<string, EventListener>();
  const audio = {
    preload: "",
    src: "",
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, listener);
    },
    removeAttribute: vi.fn(),
    load: vi.fn(),
  };
  return {
    create: () => {
      queueMicrotask(() => {
        if (trigger === "loadeddata") listeners.get("loadeddata")?.(new Event("loadeddata"));
        if (trigger === "error") listeners.get("error")?.(new Event("error"));
      });
      return audio as unknown as HTMLAudioElement;
    },
  };
}

describe("probeAudioUrl", () => {
  it("resuelve true cuando el audio carga", async () => {
    const { create } = mockAudio("loadeddata");
    await expect(probeAudioUrl("/audio/ok.mp3", 1_000, create)).resolves.toBe(true);
  });

  it("resuelve false cuando el recurso falla (404)", async () => {
    const { create } = mockAudio("error");
    await expect(probeAudioUrl("/audio/missing.mp3", 1_000, create)).resolves.toBe(false);
  });

  it("resuelve false por timeout", async () => {
    const create = () =>
      ({
        preload: "",
        src: "",
        addEventListener: vi.fn(),
        removeAttribute: vi.fn(),
        load: vi.fn(),
      }) as unknown as HTMLAudioElement;
    await expect(probeAudioUrl("/audio/slow.mp3", 20, create)).resolves.toBe(false);
  });
});
