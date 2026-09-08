import {
  Activity,
  LoaderCircle,
  Settings2,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  demoSongs,
  isPlaceholderSong,
  type Player,
  type RoomPublicState,
} from "@slay-it/shared";
import type { ChannelStatus } from "../realtime/roomChannel";

export type Role = "host" | "player" | null;

export const partySongs = demoSongs.filter((song) => !isPlaceholderSong(song));

export function useClock(active = true, interval = 100, offsetMs = 0) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now() + offsetMs), interval);
    return () => window.clearInterval(timer);
  }, [active, interval, offsetMs]);
  return now;
}

export function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function playerName(state: RoomPublicState, id: string | null) {
  return state.players.find((player) => player.id === id)?.name ?? "Sin asignar";
}

export function StageShell({
  children,
  status,
  roomCode,
}: {
  children: ReactNode;
  status: ChannelStatus;
  roomCode?: string;
}) {
  const label =
    status === "online" ? "En vivo" : status === "connecting" ? "Conectando…" : "Sin conexión";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <div className="stage-lights" aria-hidden="true" />
      <header className="topbar">
        <a className="wordmark wordmark--small" href="/" aria-label="Slay It, volver al inicio">
          SLAY <i>IT</i>
        </a>
        <div
          className={`connection ${status === "online" ? "is-online" : status === "connecting" ? "is-connecting" : "is-offline"}`}
          role="status"
        >
          {status === "online" ? <Wifi size={16} /> : <WifiOff size={16} />}
          <span>{label}</span>
        </div>
        {roomCode && <span className="mini-code">SALA {roomCode}</span>}
      </header>
      <main id="contenido" className="stage">{children}</main>
      <Equalizer />
    </div>
  );
}

function Equalizer() {
  return (
    <div className="equalizer" aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => <i key={index} />)}
      <span className="playhead" />
    </div>
  );
}

export function Notice({ message }: { message: string }) {
  return (
    <div className="notice" role="alert">
      <Activity size={19} />
      <span>{message}</span>
    </div>
  );
}

export function ActionButton({
  children,
  busy,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: "primary" | "secondary" | "yes" | "no";
}) {
  return (
    <button {...props} disabled={props.disabled || busy} className={`button button--${variant} ${props.className ?? ""}`}>
      {busy ? <LoaderCircle className="spin" size={20} aria-hidden="true" /> : children}
    </button>
  );
}

export function PlayerList({ players, maxPlayers }: { players: Player[]; maxPlayers: number }) {
  return (
    <section className="player-card" aria-labelledby="players-title">
      <div className="section-heading">
        <div>
          <span className="step-label"><Users size={18} /> Camerinos</span>
          <h2 id="players-title">Voces listas</h2>
        </div>
        <strong className="count">{players.length}<small>/{maxPlayers}</small></strong>
      </div>
      {players.length === 0 ? (
        <p className="empty-state">La pista está lista. Comparte el código para sumar voces.</p>
      ) : (
        <ol className="player-list">
          {players.map((player, index) => (
            <li key={player.id}>
              <span className="avatar">{String(index + 1).padStart(2, "0")}</span>
              <strong>{player.name}</strong>
              <span>{player.score} pts</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Choice({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="segmented">
        {options.map(([optionValue, label]) => (
          <label key={optionValue}>
            <input type="radio" name={legend} checked={value === optionValue} onChange={() => onChange(optionValue)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Quién abre el turno sin revelar, en modo relevo, a quién le tocará la sorpresa. */
export function openingPlayerId(state: RoomPublicState): string | null {
  if (state.config.mode === "relay") return state.relayPlan?.turns[0]?.playerId ?? null;
  return state.singerId;
}

export function ConfigMissing() {
  return (
    <section className="entry-panel">
      <div className="host-entry">
        <span className="step-label"><Settings2 size={18} /> Falta un paso</span>
        <h2>Configura Supabase antes de jugar</h2>
        <p>
          Crea un proyecto gratuito en supabase.com, copia su URL y su llave anon
          pública, y guárdalas en <code>apps/web/.env</code> (o como variables del
          repositorio si vas a publicar en GitHub Pages). El README tiene el paso a
          paso completo.
        </p>
      </div>
    </section>
  );
}

/** URL de unión con ?room= para QR y deep-link. */
export function roomJoinUrl(code: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  return url.toString();
}

/** QR vía API pública (sin dependencia npm). */
export function RoomQr({ code, size = 160 }: { code: string; size?: number }) {
  const joinUrl = roomJoinUrl(code);
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(joinUrl)}`;
  return (
    <figure className="room-qr">
      <img src={src} width={size} height={size} alt={`Código QR para unirse a la sala ${code}`} />
      <figcaption>Escanea para unirte</figcaption>
    </figure>
  );
}
