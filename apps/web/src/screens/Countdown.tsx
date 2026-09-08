import {
  ListMusic,
  Mic2,
} from "lucide-react";
import type { RoomPublicState } from "@slay-it/shared";
import type { HostAudio } from "../audio/useHostAudio";
import {
  ActionButton,
  formatTime,
  openingPlayerId,
  playerName,
  useClock,
  type Role,
} from "./ui";

export function Countdown({ state, role, busy, audioReady, hostAudio, onRetryPlayback, clockOffsetMs = 0 }: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  busy: boolean;
  audioReady: boolean;
  hostAudio: HostAudio;
  onRetryPlayback: () => void;
  clockOffsetMs?: number;
}) {
  const now = useClock(true, 50, clockOffsetMs);
  const remaining = Math.max(0, Math.ceil(((state.countdownEndsAt ?? now) - now) / 1000));
  const isRelay = state.config.mode === "relay";
  const isGuess = state.config.mode === "guess";
  // Con audio in-app, al llegar a "YA" el motor espera la confirmación real
  // de `play()` antes de marcar `playing` (fix de sync P5): puede tardar un
  // instante (o bloquearse por autoplay) sin que el 3-2-1 avance más.
  const waitingForAudio = role === "host" && audioReady && state.countdownEndsAt === null;
  return (
    <section className="countdown-screen">
      <span className="step-label"><ListMusic size={18} /> La próxima pista</span>
      <h1>{isGuess ? "¿Adivinas la canción?" : state.song?.title}</h1>
      {!isGuess && <p className="artist">{state.song?.artist}</p>}
      <div className="seek-instruction">
        <span>{audioReady ? "Audio en la app" : "Audio externo"}</span>
        {!isGuess && <strong>{formatTime(state.startPosition)}</strong>}
        <p>
          {isGuess
            ? "Se oirá el instrumental unos 10 segundos. Nadie ve la letra."
            : audioReady
              ? "El anfitrión reproduce la pista; al 0 solo sigue la letra."
              : <>Busca <b>{formatTime(state.startPosition)}</b> si eres el anfitrión; dale play al llegar a 0.</>}
        </p>
      </div>
      <output className="countdown-number" aria-live="polite">{remaining || "YA"}</output>
      {waitingForAudio && hostAudio.needsGesture && (
        <div className="autoplay-nudge">
          <p>La TV bloqueó el sonido. Pulsa aquí o no arranca la letra.</p>
          <ActionButton busy={busy} onClick={onRetryPlayback}>Reproducir audio</ActionButton>
        </div>
      )}
      {waitingForAudio && !hostAudio.needsGesture && (
        <p className="waiting-copy">Arrancando el audio…</p>
      )}
      {!isGuess && (
        <p className="singer-call">
          <Mic2 /> {isRelay ? "Empieza" : "Canta"}: <strong>{playerName(state, openingPlayerId(state))}</strong>
        </p>
      )}
    </section>
  );
}
