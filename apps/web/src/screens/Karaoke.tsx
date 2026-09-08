import {
  Check,
  Gauge,
  Headphones,
  Mic2,
  Minus,
  Plus,
  RotateCcw,
  Star,
  X,
} from "lucide-react";
import {
  formatTurnSectionsLabel,
  getCurrentTurn,
  getDisplayPosition,
  getLyricWindow,
  getNextVisibleTurn,
  getPlaybackPosition,
  maskLyrics,
  type RelayTurn,
  type RoomPublicState,
} from "@slay-it/shared";
import type { HostAudio } from "../audio/useHostAudio";
import {
  ActionButton,
  Notice,
  formatTime,
  playerName,
  useClock,
  type Role,
} from "./ui";

export function GuessListen({
  state,
  role,
  busy,
  hostAudio,
  clockOffsetMs = 0,
}: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  busy: boolean;
  hostAudio: HostAudio;
  clockOffsetMs?: number;
}) {
  const now = useClock(true, 80, clockOffsetMs);
  const hostAudioPosition = role === "host" ? hostAudio.getCurrentTime() : null;
  const position = hostAudioPosition ?? getDisplayPosition(state, now, role);
  const clipStart = state.guessQuestion?.clipStart ?? state.startPosition;
  const clipEnd = state.guessQuestion?.clipEnd ?? clipStart + 10;
  const span = Math.max(0.001, clipEnd - clipStart);
  const progress = Math.min(100, Math.max(0, ((position - clipStart) / span) * 100));

  return (
    <section className="guess-listen">
      <span className="step-label"><Headphones size={18} /> Adivina la canción</span>
      <h1>Escucha…</h1>
      <p>El instrumental suena unos 10 segundos. Nadie ve la letra.</p>
      <div className="progress-track" aria-label={`Clip: ${Math.round(progress)}%`}>
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
      <output className="reveal-timer">{Math.max(0, Math.ceil(clipEnd - position))}s</output>
      {role === "host" && hostAudio.needsGesture && hostAudio.hasAudio && (
        <div className="autoplay-nudge">
          <p>La TV bloqueó el sonido. Pulsa aquí o no arranca la letra.</p>
          <ActionButton
            busy={busy}
            onClick={() => {
              void hostAudio.playFrom(getPlaybackPosition(state));
            }}
          >
            Reproducir audio
          </ActionButton>
        </div>
      )}
    </section>
  );
}

export function Karaoke({ state, role, busy, error, onRecalibrate, onEndKaraokeTurn, hostAudio, clockOffsetMs = 0 }: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  busy: boolean;
  error: string;
  onRecalibrate: (delta: number) => void;
  onEndKaraokeTurn: () => void;
  hostAudio: HostAudio;
  clockOffsetMs?: number;
}) {
  const now = useClock(true, 80, clockOffsetMs);
  const song = state.song;
  if (!song) return <Notice message="No se encontró la canción de esta ronda." />;

  // El host ancla la letra a `audio.currentTime` (fuente real de verdad):
  // evita drift del reloj de pared frente al audio que realmente se oye.
  // Los jugadores siguen el playhead que reporta el host (P5), no su propio
  // reloj de pared: así la letra sigue al altavoz real de la TV.
  const hostAudioPosition = role === "host" ? hostAudio.getCurrentTime() : null;
  const position = hostAudioPosition ?? getDisplayPosition(state, now, role);
  const isKaraoke = state.config.mode === "karaoke";
  const { previous, current, next } = getLyricWindow(song, position);
  const blackoutWindow = Boolean(
    state.blackout && position >= state.blackout.start && position < state.blackout.end,
  );
  const isHidden = (line: (typeof current) | undefined) =>
    Boolean(line && blackoutWindow && state.blackout?.lineIds.includes(line.id));
  const displayText = (line: (typeof current) | undefined, fallback = " ") => {
    if (!line) return fallback;
    if (!isHidden(line)) return line.text;
    return state.config.mask === "partial" ? maskLyrics(line.text) : " ";
  };
  const inBlackout = isHidden(current);
  const isRelay = state.config.mode === "relay";
  const currentTurn: RelayTurn | null =
    isRelay && state.relayPlan
      ? state.relayPlan.turns[state.activeTurnIndex ?? 0] ??
        getCurrentTurn(state.relayPlan, song, position)
      : null;
  const activeSingerId = isRelay ? currentTurn?.playerId ?? null : state.singerId;
  const nextTurn =
    isRelay && state.relayPlan && currentTurn
      ? getNextVisibleTurn(state.relayPlan, currentTurn)
      : null;
  const progress = Math.min(100, Math.max(0, (position / song.duration) * 100));

  return (
    <section className={`karaoke-screen ${inBlackout ? "blackout-active" : ""}`}>
      <div className="track-meta">
        <div><span>Ahora suena</span><strong>{song.title}</strong><small>{song.artist}</small></div>
        <time>{formatTime(position)}</time>
      </div>
      <div className="progress-track" aria-label={`Progreso de la canción: ${Math.round(progress)}%`}>
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
      <div className="singer-strip">
        <Mic2 size={19} />
        <span>Canta ahora</span>
        <strong>{playerName(state, activeSingerId)}</strong>
        {isRelay && currentTurn && (
          <em>
            Vuelta {currentTurn.round} · Turno {currentTurn.index + 1} · {formatTurnSectionsLabel(song, currentTurn)}
            {currentTurn.kind === "blackout" ? " · ¡Apagón!" : ""}
          </em>
        )}
      </div>
      {isRelay && nextTurn && (
        <p className="next-turn">
          Sigue: <strong>{playerName(state, nextTurn.playerId)}</strong>
          {" · "}
          {nextTurn.sectionIds.length} estrofa{nextTurn.sectionIds.length === 1 ? "" : "s"}
        </p>
      )}
      <div className="lyrics-stage" aria-live="off">
        <p className="lyric lyric--past">{displayText(previous)}</p>
        {inBlackout && state.config.mask === "total" ? (
          <div className="blackout-signal" role="img" aria-label="Telón de blackout: canta de memoria">
            <span /><span /><span /><span /><span />
          </div>
        ) : (
          <p className={`lyric lyric--current ${inBlackout ? "is-masked" : ""}`}>{displayText(current, "Prepárate…")}</p>
        )}
        <p className="lyric lyric--next">{displayText(next)}</p>
      </div>
      {role === "host" && hostAudio.needsGesture && hostAudio.hasAudio && (
        <div className="autoplay-nudge">
          <p>La TV bloqueó el sonido. Pulsa aquí o no arranca la letra.</p>
          <ActionButton
            busy={busy}
            onClick={() => {
              void hostAudio.playFrom(getPlaybackPosition(state));
            }}
          >
            Reproducir audio
          </ActionButton>
        </div>
      )}
      {role === "host" && isKaraoke && (
        <ActionButton busy={busy} onClick={onEndKaraokeTurn}>
          <Star size={18} /> Terminar interpretación
        </ActionButton>
      )}
      {role === "host" && (
        <div className="calibration">
          <span><Gauge size={18} /> Calibración · {formatTime(position)}</span>
          <div>
            <ActionButton variant="secondary" busy={busy} onClick={() => onRecalibrate(-500)}><Minus /> 0.5 s</ActionButton>
            <ActionButton variant="secondary" busy={busy} onClick={() => onRecalibrate(-100)}><Minus /> 0.1 s</ActionButton>
            <ActionButton variant="secondary" busy={busy} onClick={() => onRecalibrate(100)}><Plus /> 0.1 s</ActionButton>
            <ActionButton variant="secondary" busy={busy} onClick={() => onRecalibrate(500)}><Plus /> 0.5 s</ActionButton>
          </div>
        </div>
      )}
      {error && <Notice message={error} />}
    </section>
  );
}

export function Reveal({ state, role, busy, error, onResolve }: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  busy: boolean;
  error: string;
  onResolve: (correct: boolean) => void;
}) {
  const now = useClock(true, 100);
  const missing = state.song?.lines.filter((line) => state.blackout?.lineIds.includes(line.id)) ?? [];
  const remaining = Math.max(0, Math.ceil(((state.revealEndsAt ?? now) - now) / 1000));
  const manualHost = !state.config.groupVoting && role === "host";
  if (state.config.mode === "guess") {
    const points = state.lastGuessPoints ?? {};
    const roundLine = state.players
      .map((player) => {
        const pts = points[player.id] ?? 0;
        return `${player.name} ${pts > 0 ? "+" : ""}${pts}`;
      })
      .join(" · ");
    return (
      <section className="reveal-screen">
        <span className="step-label"><Headphones size={18} /> Era</span>
        <h1>{state.song?.title}</h1>
        <p className="artist">{state.song?.artist}</p>
        <div className="guess-grid">
          {(state.guessQuestion?.options ?? []).map((option, index) => (
            <div
              key={option.id}
              className={`guess-option guess-option--${index} ${option.id === state.guessQuestion?.correctOptionId ? "is-correct" : ""}`}
            >
              {option.label}
            </div>
          ))}
        </div>
        <p className="relay-hint">{roundLine}</p>
        {remaining > 0 && <output className="reveal-timer">{remaining}s</output>}
        <p className="waiting-copy">El marcador llega solo.</p>
        {error && <Notice message={error} />}
      </section>
    );
  }
  return (
    <section className="reveal-screen">
      <span className="step-label"><RotateCcw size={18} /> La letra era</span>
      <div className="reveal-lines">
        {missing.map((line) => <p key={line.id}>{line.text}</p>)}
      </div>
      {remaining > 0 && <output className="reveal-timer">{remaining}s</output>}
      {manualHost && remaining === 0 ? (
        <div className="decision-panel">
          <h2>¿Lo hizo {playerName(state, state.singerId)}?</h2>
          <div className="decision-actions">
            <ActionButton variant="yes" busy={busy} onClick={() => onResolve(true)}><Check /> Lo hizo</ActionButton>
            <ActionButton variant="no" busy={busy} onClick={() => onResolve(false)}><X /> No lo hizo</ActionButton>
          </div>
        </div>
      ) : !state.config.groupVoting ? (
        <p className="waiting-copy">{remaining > 0 ? "Mira la respuesta…" : "El anfitrión decide el resultado."}</p>
      ) : (
        <p className="waiting-copy">Prepárense para votar.</p>
      )}
      {error && <Notice message={error} />}
    </section>
  );
}
