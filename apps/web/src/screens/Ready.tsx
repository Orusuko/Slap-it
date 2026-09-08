import {
  ArrowRight,
  Headphones,
  ListMusic,
  Mic2,
  Sparkles,
  Star,
  Upload,
} from "lucide-react";
import {
  relayWillBeShort,
  type RoomPublicState,
} from "@slay-it/shared";
import type { HostAudio } from "../audio/useHostAudio";
import {
  ActionButton,
  Notice,
  formatTime,
  openingPlayerId,
  playerName,
  type Role,
} from "./ui";

export function Ready({ state, role, busy, error, onCountdown, hostAudio }: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  busy: boolean;
  error: string;
  onCountdown: () => void;
  hostAudio: HostAudio;
}) {
  const isRelay = state.config.mode === "relay";
  const isKaraoke = state.config.mode === "karaoke";
  const isGuess = state.config.mode === "guess";
  const rounds = state.relayPlan?.roundsCompleted ?? 2;
  const audioReady = role === "host" ? hostAudio.hasAudio : state.hostHasAudio;
  const probing = role === "host" && hostAudio.probing;
  const canStart = !probing && (!isGuess || (role === "host" ? hostAudio.hasAudio : true));
  return (
    <section className="countdown-screen">
      <span className="step-label"><ListMusic size={18} /> Pista preparada</span>
      <h1>{isGuess ? "¿Adivinas la canción?" : state.song?.title}</h1>
      {!isGuess && <p className="artist">{state.song?.artist}</p>}
      <div className="seek-instruction">
        <span>
          {probing ? "Comprobando audio…" : audioReady ? "Audio listo en la app" : "Antes de comenzar"}
        </span>
        {!isGuess && <strong>{formatTime(state.startPosition)}</strong>}
        {probing ? (
          <p>Espera un momento mientras se verifica si hay un archivo de audio en la app.</p>
        ) : audioReady ? (
          <p>
            {isGuess ? (
              role === "host" ? (
                <>
                  Se oirá el instrumental unos 10 segundos. Nadie ve la letra.
                  Fuente: <b>{hostAudio.fileName}</b>
                  {hostAudio.source === "catalog" ? " (catálogo)" : hostAudio.source === "manual" ? " (adjunto)" : ""}.
                </>
              ) : (
                <>El anfitrión reproduce el instrumental. Nadie ve título ni letra.</>
              )
            ) : role === "host" ? (
              <>
                Se reproducirá solo desde {formatTime(state.startPosition)}.
                Fuente: <b>{hostAudio.fileName}</b>
                {hostAudio.source === "catalog" ? " (catálogo)" : hostAudio.source === "manual" ? " (adjunto)" : ""}.
              </>
            ) : (
              <>El anfitrión reproduce la pista en la app. Solo sigue la letra en pantalla.</>
            )}
          </p>
        ) : isGuess ? (
          <p>
            {role === "host"
              ? "Este modo necesita el MP3 en la TV. Sin audio in-app no se puede buscar en Spotify: spoilearía la respuesta."
              : "El anfitrión pondrá el instrumental en la TV. Nadie ve título ni letra."}
          </p>
        ) : (
          <p>
            {role === "host"
              ? "Busca este instante en Spotify o YouTube y deja el audio pausado. Pon exactamente esta pista."
              : "El anfitrión usará audio externo. Sigue la letra; no hace falta que busques la canción en el teléfono."}
          </p>
        )}
      </div>
      {isGuess ? (
        <p className="relay-hint">
          <Headphones size={16} /> Se oirá el instrumental unos 10 segundos. Nadie ve la letra.
        </p>
      ) : isRelay ? (
        <p className="singer-call">
          <Mic2 /> Empieza: <strong>{playerName(state, openingPlayerId(state))}</strong>
        </p>
      ) : (
        <p className="singer-call"><Mic2 /> Canta: <strong>{playerName(state, state.singerId)}</strong></p>
      )}
      {state.songRepeatWarning && (
        <p className="wizard-error">Esta canción ya salió esta noche.</p>
      )}
      {isRelay && state.song && relayWillBeShort(state.song, state.players.length) && (
        <p className="wizard-error">
          Con {state.players.length} jugadores, esta canción tiene pocas estrofas: el relevo quedará corto.
        </p>
      )}
      {isRelay && (
        <p className="relay-hint">
          <Sparkles size={16} /> Relevo por turnos de 1 a 4 estrofas. Tras {rounds === 1 ? "una vuelta" : "dos vueltas"} completas, a alguien se le apagará la letra por sorpresa.
        </p>
      )}
      {isKaraoke && (
        <p className="relay-hint">
          <Star size={16} /> Letra siempre visible. Al terminar la canción, el resto vota de 1 a 5 estrellas.
        </p>
      )}
      {role === "host" && (
        <div className="audio-attach">
          <label>
            <Upload size={16} />
            <span>
              {hostAudio.source === "manual"
                ? hostAudio.fileName
                : hostAudio.source === "catalog"
                  ? `Catálogo: ${hostAudio.fileName} · o adjunta otro`
                  : "Adjuntar audio local (opcional)"}
            </span>
            <input
              type="file"
              accept="audio/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) hostAudio.attach(file);
              }}
            />
          </label>
          {hostAudio.source === "manual" && (
            <button
              type="button"
              onClick={() => {
                hostAudio.clear();
                hostAudio.loadCatalog(state.song);
              }}
            >
              Quitar adjunto
            </button>
          )}
        </div>
      )}
      {role === "host" ? (
        <ActionButton
          busy={busy || probing}
          disabled={!canStart || (isGuess && !hostAudio.hasAudio)}
          onClick={onCountdown}
        >
          {probing ? "Comprobando audio…" : <>Todo listo · iniciar 3-2-1 <ArrowRight size={20} /></>}
        </ActionButton>
      ) : (
        <p className="waiting-copy">El anfitrión está preparando la pista.</p>
      )}
      {error && <Notice message={error} />}
    </section>
  );
}
