import {
  Check,
  Headphones,
  Star,
  Vote,
  X,
} from "lucide-react";
import type { RoomPublicState } from "@slay-it/shared";
import {
  ActionButton,
  Notice,
  playerName,
  useClock,
  type Role,
} from "./ui";

export function Voting({
  state,
  role,
  clientId,
  busy,
  error,
  onVote,
  onVoteStars,
  onAnswer,
  onCloseKaraokeVoting,
  onCloseGuessVoting,
}: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  clientId: string;
  busy: boolean;
  error: string;
  onVote: (yes: boolean) => void;
  onVoteStars: (stars: number) => void;
  onAnswer: (optionId: string) => void;
  onCloseKaraokeVoting: () => void;
  onCloseGuessVoting: () => void;
}) {
  const isKaraoke = state.config.mode === "karaoke";
  const eligible = Math.max(0, state.players.length - 1);
  const singer = state.singerId === clientId;
  const now = useClock(state.config.mode === "guess", 100);
  if (state.config.mode === "guess") {
    const count = Object.keys(state.guessAnswers).length;
    const answered = Object.hasOwn(state.guessAnswers, clientId);
    const remaining = Math.max(0, Math.ceil(((state.guessDeadlineAt ?? now) - now) / 1000));
    return (
      <section className="voting-screen">
        <span className="step-label"><Headphones size={18} /> ¿Qué canción es?</span>
        <h1>Elige una opción</h1>
        <p>Primera respuesta se bloquea. Quien acierte más rápido suma más.</p>
        <div className="vote-progress">
          <strong>{count}/{state.players.length}</strong>
          <span>respuestas</span>
        </div>
        {remaining > 0 && <output className="reveal-timer">{remaining}s</output>}
        <div className="guess-grid">
          {(state.guessQuestion?.options ?? []).map((option, index) => (
            <button
              key={option.id}
              type="button"
              className={`guess-option guess-option--${index} ${answered ? "is-locked" : ""}`}
              disabled={role === "host" || answered || busy}
              onClick={() => onAnswer(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {role === "host" ? (
          <ActionButton variant="secondary" busy={busy} onClick={onCloseGuessVoting}>
            Cerrar ahora
          </ActionButton>
        ) : answered ? (
          <p className="voted-confirmation"><Check /> Respuesta bloqueada</p>
        ) : (
          <p className="waiting-copy">Toca una opción. No se puede cambiar.</p>
        )}
        {error && <Notice message={error} />}
      </section>
    );
  }

  if (isKaraoke) {
    const count = Object.keys(state.starVotes).length;
    const voted = Object.hasOwn(state.starVotes, clientId);
    const myStars = state.starVotes[clientId] ?? 0;
    return (
      <section className="voting-screen">
        <span className="step-label"><Star size={18} /> Voto de estrellas</span>
        <h1>¿Cómo estuvo {playerName(state, state.singerId)}?</h1>
        <p>Cada estrella suma 1 punto. Quien cantó no vota.</p>
        <div className="vote-progress">
          <strong>{count}/{eligible}</strong>
          <span>votos recibidos</span>
        </div>
        {role === "host" ? (
          <ActionButton variant="secondary" busy={busy} onClick={onCloseKaraokeVoting}>
            Cerrar votación ahora
          </ActionButton>
        ) : singer ? (
          <p className="waiting-copy">Cantaste esta ronda. Espera tus estrellas.</p>
        ) : (
          <div className="star-picker">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={value <= myStars ? "is-active" : ""}
                disabled={busy}
                onClick={() => onVoteStars(value)}
                aria-label={`${value} estrella${value === 1 ? "" : "s"}`}
              >
                <Star size={28} fill={value <= myStars ? "currentColor" : "none"} />
              </button>
            ))}
            {voted && <p className="voted-confirmation"><Check /> {myStars} estrella{myStars === 1 ? "" : "s"} enviadas. Puedes cambiar tu voto.</p>}
          </div>
        )}
        {error && <Notice message={error} />}
      </section>
    );
  }

  const count = Object.keys(state.votes).length;
  const voted = Object.hasOwn(state.votes, clientId);
  return (
    <section className="voting-screen">
      <span className="step-label"><Vote size={18} /> Veredicto del público</span>
      <h1>¿Se sabía la letra?</h1>
      <p>Votan quienes escucharon. La persona que cantó no participa.</p>
      <div className="vote-progress">
        <strong>{count}/{eligible}</strong>
        <span>votos recibidos</span>
      </div>
      {role === "host" ? (
        <p className="waiting-copy">Observando la votación en vivo.</p>
      ) : singer ? (
        <p className="waiting-copy">Cantaste esta ronda. Espera el veredicto.</p>
      ) : voted ? (
        <p className="voted-confirmation"><Check /> Voto registrado. Solo cuenta una vez.</p>
      ) : (
        <div className="decision-actions">
          <ActionButton variant="yes" busy={busy} onClick={() => onVote(true)}><Check /> Sí, lo hizo</ActionButton>
          <ActionButton variant="no" busy={busy} onClick={() => onVote(false)}><X /> No esta vez</ActionButton>
        </div>
      )}
      {error && <Notice message={error} />}
    </section>
  );
}
