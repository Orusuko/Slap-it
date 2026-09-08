import {
  ArrowRight,
  Check,
  Headphones,
  Star,
  Trophy,
  X,
} from "lucide-react";
import type { RoomPublicState } from "@slay-it/shared";
import {
  ActionButton,
  Notice,
  playerName,
  type Role,
} from "./ui";

export function Score({ state, role, busy, error, onContinue, onExtendRound, onFinishShow }: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  busy: boolean;
  error: string;
  onContinue: () => void;
  onExtendRound: () => void;
  onFinishShow: () => void;
}) {
  const isKaraoke = state.config.mode === "karaoke";
  const isGuess = state.config.mode === "guess";
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const isLastRound = state.round + 1 >= state.totalRounds;
  return (
    <section className="score-screen">
      {isGuess ? (
        <div className="result-stamp is-hit">
          <Headphones />
          <span>Puntos de la ronda</span>
          <small>
            {state.players
              .map((player) => `${player.name} +${state.lastGuessPoints?.[player.id] ?? 0}`)
              .join(" · ")}
          </small>
        </div>
      ) : isKaraoke ? (
        <div className="result-stamp is-hit">
          <Star />
          <span>{state.lastStars ?? 0} pts</span>
          <small>{playerName(state, state.singerId)}</small>
        </div>
      ) : (
        <div className={`result-stamp ${state.lastResult ? "is-hit" : "is-miss"}`}>
          {state.lastResult ? <Check /> : <X />}
          <span>{state.lastResult ? "¡Punto!" : "Casi"}</span>
          <small>{playerName(state, state.singerId)}</small>
        </div>
      )}
      <div className="scoreboard">
        <span className="step-label"><Trophy size={18} /> Marcador</span>
        <ol>
          {sorted.map((player, index) => (
            <li key={player.id}><span>{index + 1}</span><strong>{player.name}</strong><b>{player.score} pts</b></li>
          ))}
        </ol>
      </div>
      {role === "host" ? (
        <div className="score-actions">
          <ActionButton busy={busy} onClick={isLastRound ? onExtendRound : onContinue}>
            {isLastRound ? "Una más" : "Siguiente ronda"} <ArrowRight />
          </ActionButton>
          <ActionButton variant="secondary" busy={busy} onClick={isLastRound ? onContinue : onFinishShow}>
            {isLastRound ? "Ver resultado final" : "Terminar show"}
          </ActionButton>
        </div>
      ) : <p className="waiting-copy">El anfitrión prepara la siguiente ronda.</p>}
      {error && <Notice message={error} />}
    </section>
  );
}
