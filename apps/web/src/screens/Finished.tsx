import {
  RotateCcw,
  Trophy,
} from "lucide-react";
import type { RoomPublicState } from "@slay-it/shared";
import { clearHostSnapshot } from "../game/hostSnapshot";
import {
  ActionButton,
  type Role,
} from "./ui";

export function Finished({
  state,
  role,
  onResetToLobby,
}: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  onResetToLobby: () => void;
}) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const ranks = [...new Set(sorted.map((player) => player.score))];
  const earlyEnd = state.endReason === "not_enough_players";
  return (
    <section className="finished-screen">
      <span className="step-label"><Trophy size={18} /> Final del show</span>
      <h1>{earlyEnd ? "Show interrumpido" : "Ovación final"}</h1>
      {earlyEnd && (
        <p className="waiting-copy">
          La partida terminó: no quedan suficientes voces para seguir el relevo.
        </p>
      )}
      <div className="podium">
        {sorted.map((player) => {
          const rank = ranks.indexOf(player.score) + 1;
          return (
            <div key={player.id} className={`podium-place podium-place--${Math.min(rank, 3)}`}>
              <span>{rank}º</span><strong>{player.name}</strong><b>{player.score} pts</b>
            </div>
          );
        })}
      </div>
      {role === "host" ? (
        <div className="new-room">
          <p>¿Seguimos con la misma sala o abrimos otra?</p>
          <ActionButton onClick={onResetToLobby}>
            <RotateCcw /> Otra noche
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={() => {
              clearHostSnapshot();
              window.location.reload();
            }}
          >
            Crear nueva sala
          </ActionButton>
        </div>
      ) : <p className="waiting-copy">Gracias por subir al escenario.</p>}
    </section>
  );
}
