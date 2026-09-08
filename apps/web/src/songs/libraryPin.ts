const PIN_SESSION_KEY = "slay-it-library-pin";

function configuredPin(override?: string): string {
  if (override !== undefined) return override.trim();
  return String(import.meta.env.VITE_LIBRARY_PIN ?? "").trim();
}

/** Freno de UI: la anon key sigue en el bundle; esto no es autenticación real. */
export function libraryPinRequired(pin = configuredPin()): boolean {
  return pin.length > 0;
}

export function libraryPinUnlocked(): boolean {
  try {
    return sessionStorage.getItem(PIN_SESSION_KEY) === "ok";
  } catch {
    return false;
  }
}

export function unlockLibraryPin(input: string, pin = configuredPin()): boolean {
  const expected = pin.trim();
  if (!expected) return true;
  if (input !== expected) return false;
  try {
    sessionStorage.setItem(PIN_SESSION_KEY, "ok");
  } catch {
    // sessionStorage bloqueado: el wizard pedirá el PIN otra vez.
  }
  return true;
}
