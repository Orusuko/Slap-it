import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Crown,
  Download,
  FileUp,
  Gauge,
  ListMusic,
  LoaderCircle,
  Mic2,
  Minus,
  Music2,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  Users,
  Vote,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  demoSongs,
  formatTurnSectionsLabel,
  getCurrentTurn,
  getLyricWindow,
  getNextVisibleTurn,
  getPlaybackPosition,
  isPlaceholderSong,
  maskLyrics,
  type GameConfig,
  type Player,
  type RelayTurn,
  type RoomPublicState,
  type Song,
} from "@slay-it/shared";
import { useHostAudio, type HostAudio } from "./audio/useHostAudio";
import { createHostEngine, type HostEngine } from "./game/hostEngine";
import { readSupabaseCredentials } from "./realtime/env";
import { createRandomId, createRequestId, type RoomAck, type RoomCommand } from "./realtime/protocol";
import {
  openHostChannel,
  openPlayerChannel,
  type ChannelStatus,
  type HostChannel,
  type PlayerChannel,
} from "./realtime/roomChannel";
import {
  deleteCloudSong,
  getStoredUploaderName,
  listCloudSongs,
  saveCloudSong,
  setStoredUploaderName,
  type CloudSongRecord,
} from "./songs/cloudSongStore";
import { downloadUserSongJson, parseUserSongJson } from "./songs/songExport";
import { UploadSongWizard } from "./songs/UploadSongWizard";

type Role = "host" | "player" | null;
const ACK_TIMEOUT_MS = 8_000;

function useClock(active = true, interval = 100, offsetMs = 0) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now() + offsetMs), interval);
    return () => window.clearInterval(timer);
  }, [active, interval, offsetMs]);
  return now;
}

/** Estima desfase host ↔ cliente a partir de `hostNow` en cada broadcast. */
function useHostClockOffset(state: RoomPublicState | null, role: Role) {
  const [offsetMs, setOffsetMs] = useState(0);
  useEffect(() => {
    if (role !== "player" || state?.hostNow == null) return;
    setOffsetMs(state.hostNow - Date.now());
  }, [role, state?.hostNow, state?.phase, state?.startedAt]);
  return role === "player" ? offsetMs : 0;
}

const partySongs = demoSongs.filter((song) => !isPlaceholderSong(song));

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function playerName(state: RoomPublicState, id: string | null) {
  return state.players.find((player) => player.id === id)?.name ?? "Sin asignar";
}

function StageShell({
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

function Notice({ message }: { message: string }) {
  return (
    <div className="notice" role="alert">
      <Activity size={19} />
      <span>{message}</span>
    </div>
  );
}

function ActionButton({
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

function Home({
  busyJoin,
  error,
  librarySongs,
  libraryLoading,
  libraryError,
  onCreate,
  onJoin,
  onOpenUpload,
  onDeleteSong,
}: {
  busyJoin: boolean;
  error: string;
  librarySongs: CloudSongRecord[];
  libraryLoading: boolean;
  libraryError: string;
  onCreate: () => void;
  onJoin: (name: string, code: string) => void;
  onOpenUpload: () => void;
  onDeleteSong: (songId: string, title: string) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onJoin(name, code);
  };

  return (
    <section className="home">
      <div className="hero-copy">
        <p className="eyebrow"><Radio size={17} /> Karaoke sincronizado</p>
        <h1 className="wordmark">SLAY <i>IT</i></h1>
        <p className="hero-line">La letra desaparece.<br /><strong>La actitud no.</strong></p>
        <div className="marquee" aria-hidden="true">
          <span>AFINA</span><span>CANTA</span><span>VOTA</span>
        </div>
        <button type="button" className="upload-entry" onClick={onOpenUpload}>
          <Music2 size={18} />
          <span>
            <strong>Sube tu canción</strong>
            <small>Carga audio, letra y sincroniza por taps entre amigos</small>
          </span>
          <ArrowRight size={18} />
        </button>
        {libraryLoading && librarySongs.length === 0 && (
          <p className="library-status">Cargando biblioteca del grupo…</p>
        )}
        {!libraryLoading && libraryError && (
          <p className="library-status is-error">{libraryError}</p>
        )}
        {librarySongs.length > 0 && (
          <div className="home-songs">
            <div className="home-songs-head">
              <span>Biblioteca del grupo</span>
            </div>
            <ul>
              {librarySongs.map(({ song, uploadedBy }) => (
                <li key={song.id}>
                  <span>
                    <strong>{song.title}</strong>
                    <small>{song.artist} · subida por {uploadedBy}</small>
                  </span>
                  <button type="button" onClick={() => onDeleteSong(song.id, song.title)} aria-label={`Eliminar ${song.title}`}>
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!libraryLoading && !libraryError && librarySongs.length === 0 && (
          <p className="library-status">Aún no hay canciones en la biblioteca. Sube la primera.</p>
        )}
      </div>

      <div className="entry-panel">
        <div className="host-entry">
          <span className="step-label"><Crown size={18} /> Control del escenario</span>
          <h2>¿Tú llevas el show?</h2>
          <p>Crea una sala, configura la ronda y proyecta esta pantalla en la TV.</p>
          <ActionButton type="button" disabled={busyJoin} onClick={onCreate}>
            Crear sala <ArrowRight size={20} />
          </ActionButton>
        </div>

        <div className="cut-line"><span>o entra a cantar</span></div>

        <form className="join-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="player-name">Tu nombre</label>
            <input
              id="player-name"
              autoComplete="nickname"
              maxLength={24}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Valeria"
            />
          </div>
          <div className="field">
            <label htmlFor="room-code">Código de sala</label>
            <input
              id="room-code"
              className="code-input"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={4}
              minLength={4}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
              placeholder="ABCD"
            />
          </div>
          <ActionButton type="submit" variant="secondary" busy={busyJoin}>
            Entrar al escenario <ChevronRight size={20} />
          </ActionButton>
        </form>
        {error && <Notice message={error} />}
      </div>
    </section>
  );
}

function PlayerList({ players, maxPlayers }: { players: Player[]; maxPlayers: number }) {
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

function Lobby({
  state,
  role,
  busy,
  error,
  librarySongs,
  libraryError,
  pendingImportSong,
  onConfig,
  onSelectSong,
  onStart,
  onOpenUpload,
  onExportSong,
  onDeleteSong,
  onImportJsonFile,
  onImportAudioFile,
  onCancelImport,
}: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  busy: boolean;
  error: string;
  librarySongs: CloudSongRecord[];
  libraryError: string;
  pendingImportSong: Song | null;
  onConfig: (config: GameConfig) => void;
  onSelectSong: (songId: string | null) => void;
  onStart: (config: GameConfig) => void;
  onOpenUpload: () => void;
  onExportSong: (songId: string) => void;
  onDeleteSong: (songId: string, title: string) => void;
  onImportJsonFile: (file: File) => void;
  onImportAudioFile: (file: File) => void;
  onCancelImport: () => void;
}) {
  const [config, setConfig] = useState<GameConfig>(state.config);
  useEffect(() => setConfig(state.config), [state.config]);

  const patchConfig = <K extends keyof GameConfig>(key: K, value: GameConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));

  return (
    <div className="lobby">
      <section className="room-beacon">
        <p>{role === "host" ? "Tu sala está al aire" : "Estás dentro"}</p>
        <h1>{state.code}</h1>
        <span>{role === "host" ? "Compártelo con tus jugadores" : "El anfitrión prepara la pista"}</span>
      </section>

      <div className="lobby-grid">
        <PlayerList players={state.players} maxPlayers={state.config.maxPlayers} />

        {role === "host" ? (
          <form
            className="config-card"
            onSubmit={(event) => {
              event.preventDefault();
              onStart(config);
            }}
          >
            <div className="section-heading">
              <div>
                <span className="step-label"><Settings2 size={18} /> Dirección</span>
                <h2>Configura la ronda</h2>
              </div>
            </div>
            <div className={`mode-spotlight ${config.mode === "relay" ? "is-active" : ""}`}>
              <Sparkles size={18} />
              <div>
                <strong>Relevo con sorpresa</strong>
                <p>
                  Modo principal: turnos de 1 a 4 estrofas en orden. Tras dos vueltas,
                  a alguien se le apaga la letra sin avisar.
                </p>
              </div>
            </div>
            <fieldset>
              <legend>Máximo de jugadores</legend>
              <div className="number-stepper">
                <button type="button" aria-label="Reducir máximo" onClick={() => patchConfig("maxPlayers", Math.max(2, state.players.length, config.maxPlayers - 1))}><Minus /></button>
                <output>{config.maxPlayers}</output>
                <button type="button" aria-label="Aumentar máximo" onClick={() => patchConfig("maxPlayers", Math.min(8, config.maxPlayers + 1))}><Plus /></button>
              </div>
            </fieldset>
            <Choice
              legend="Modo de canto"
              value={config.mode}
              options={[["relay", "Relevo + sorpresa"], ["individual", "Individual"]]}
              onChange={(value) => patchConfig("mode", value as GameConfig["mode"])}
            />
            {config.mode === "relay" ? (
              <p className="config-note">
                En relevo el apagón son 1–2 estrofas al azar tras las vueltas; no se configura por línea.
              </p>
            ) : (
              <Choice
                legend="Telón de apagón"
                value={config.blackoutDuration}
                options={[["line", "Una línea"], ["section", "Sección completa"]]}
                onChange={(value) => patchConfig("blackoutDuration", value as GameConfig["blackoutDuration"])}
              />
            )}
            <Choice
              legend="Máscara de letra"
              value={config.mask}
              options={[["total", "Total"], ["partial", "Parcial"]]}
              onChange={(value) => patchConfig("mask", value as GameConfig["mask"])}
            />
            <label className="switch-row">
              <span><Vote size={19} /><span><strong>Voto grupal</strong><small>Los jugadores deciden el resultado</small></span></span>
              <input type="checkbox" checked={config.groupVoting} onChange={(event) => patchConfig("groupVoting", event.target.checked)} />
            </label>
            <label className="song-pick">
              <span>Canción</span>
              <select
                value={state.selectedSongId ?? ""}
                onChange={(event) => onSelectSong(event.target.value || null)}
              >
                <option value="">Al azar (catálogo de fiesta)</option>
                {librarySongs.length > 0 && (
                  <optgroup label="Biblioteca del grupo">
                    {librarySongs.map(({ song }) => (
                      <option key={song.id} value={song.id}>
                        {song.title} — {song.artist}
                      </option>
                    ))}
                  </optgroup>
                )}
                {partySongs.length > 0 && (
                  <optgroup label="Catálogo">
                    {partySongs.map((song) => (
                      <option key={song.id} value={song.id}>
                        {song.title} — {song.artist}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <div className="song-pick-tools">
              <button type="button" onClick={onOpenUpload}>
                <Music2 size={15} /> Sube tu canción
              </button>
              {state.selectedSongId && librarySongs.some((record) => record.song.id === state.selectedSongId) && (
                <>
                  <button type="button" onClick={() => onExportSong(state.selectedSongId!)}>
                    <Download size={15} /> Exportar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const record = librarySongs.find((item) => item.song.id === state.selectedSongId);
                      if (record) onDeleteSong(record.song.id, record.song.title);
                    }}
                  >
                    <Trash2 size={15} /> Eliminar
                  </button>
                </>
              )}
              {pendingImportSong ? (
                <div className="song-import-pending">
                  <span>Adjunta el MP3 de "{pendingImportSong.title}"</span>
                  <label className="song-import">
                    <FileUp size={15} /> Elegir audio
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onImportAudioFile(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <button type="button" onClick={onCancelImport}>Cancelar</button>
                </div>
              ) : (
                <label className="song-import">
                  <FileUp size={15} /> Importar JSON
                  <input
                    type="file"
                    accept="application/json"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onImportJsonFile(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            <p className="helper">
              La biblioteca es compartida: lo que subas aquí lo ven tus amigos desde cualquier
              dispositivo. Importar un JSON exportado te pedirá el MP3 para subirlo también.
            </p>
            {libraryError && <p className="helper">No se pudo cargar la biblioteca: {libraryError}</p>}
            <ActionButton
              type="button"
              variant="secondary"
              busy={busy}
              onClick={() => onConfig(config)}
            >
              Guardar configuración
            </ActionButton>
            <ActionButton type="submit" busy={busy} disabled={state.players.length < 2}>
              <Mic2 size={20} /> Empezar show
            </ActionButton>
            {state.players.length < 2 && <p className="helper">Se necesitan al menos 2 jugadores.</p>}
          </form>
        ) : (
          <section className="waiting-card">
            <LoaderCircle className="slow-spin" size={48} />
            <h2>Prueba de sonido</h2>
            <p className="mode-chip">
              {state.config.mode === "relay"
                ? "Modo: relevo con sorpresa — turnos de 1 a 4 estrofas; tras dos vueltas alguien canta a oscuras."
                : "Modo: individual — cada quien canta su tramo y recibe su apagón."}
            </p>
            <p>Espera aquí. El anfitrión iniciará cuando estén todas las voces.</p>
          </section>
        )}
      </div>
      {error && <Notice message={error} />}
    </div>
  );
}

function Choice({
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
function openingPlayerId(state: RoomPublicState): string | null {
  if (state.config.mode === "relay") return state.relayPlan?.turns[0]?.playerId ?? null;
  return state.singerId;
}

function Ready({ state, role, busy, error, onCountdown, hostAudio }: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  busy: boolean;
  error: string;
  onCountdown: () => void;
  hostAudio: HostAudio;
}) {
  const isRelay = state.config.mode === "relay";
  const rounds = state.relayPlan?.roundsCompleted ?? 2;
  const audioReady = role === "host" ? hostAudio.hasAudio : state.hostHasAudio;
  const probing = role === "host" && hostAudio.probing;
  const canStart = !probing;
  return (
    <section className="countdown-screen">
      <span className="step-label"><ListMusic size={18} /> Pista preparada</span>
      <h1>{state.song?.title}</h1>
      <p className="artist">{state.song?.artist}</p>
      <div className="seek-instruction">
        <span>
          {probing ? "Comprobando audio…" : audioReady ? "Audio listo en la app" : "Antes de comenzar"}
        </span>
        <strong>{formatTime(state.startPosition)}</strong>
        {probing ? (
          <p>Espera un momento mientras se verifica si hay un archivo de audio en la app.</p>
        ) : audioReady ? (
          <p>
            {role === "host" ? (
              <>
                Se reproducirá solo desde {formatTime(state.startPosition)}.
                Fuente: <b>{hostAudio.fileName}</b>
                {hostAudio.source === "catalog" ? " (catálogo)" : hostAudio.source === "manual" ? " (adjunto)" : ""}.
              </>
            ) : (
              <>El anfitrión reproduce la pista en la app. Solo sigue la letra en pantalla.</>
            )}
          </p>
        ) : (
          <p>
            {role === "host"
              ? "Busca este instante en Spotify o YouTube y deja el audio pausado. Pon exactamente esta pista."
              : "El anfitrión usará audio externo. Sigue la letra; no hace falta que busques la canción en el teléfono."}
          </p>
        )}
      </div>
      {isRelay ? (
        <p className="singer-call">
          <Mic2 /> Empieza: <strong>{playerName(state, openingPlayerId(state))}</strong>
        </p>
      ) : (
        <p className="singer-call"><Mic2 /> Canta: <strong>{playerName(state, state.singerId)}</strong></p>
      )}
      {isRelay && (
        <p className="relay-hint">
          <Sparkles size={16} /> Relevo por turnos de 1 a 4 estrofas. Tras {rounds === 1 ? "una vuelta" : "dos vueltas"} completas, a alguien se le apagará la letra por sorpresa.
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
        <ActionButton busy={busy || probing} disabled={!canStart} onClick={onCountdown}>
          {probing ? "Comprobando audio…" : <>Todo listo · iniciar 3-2-1 <ArrowRight size={20} /></>}
        </ActionButton>
      ) : (
        <p className="waiting-copy">El anfitrión está preparando la pista.</p>
      )}
      {error && <Notice message={error} />}
    </section>
  );
}

function Countdown({ state, audioReady, clockOffsetMs = 0 }: {
  state: RoomPublicState;
  audioReady: boolean;
  clockOffsetMs?: number;
}) {
  const now = useClock(true, 50, clockOffsetMs);
  const remaining = Math.max(0, Math.ceil(((state.countdownEndsAt ?? now) - now) / 1000));
  const isRelay = state.config.mode === "relay";
  return (
    <section className="countdown-screen">
      <span className="step-label"><ListMusic size={18} /> La próxima pista</span>
      <h1>{state.song?.title}</h1>
      <p className="artist">{state.song?.artist}</p>
      <div className="seek-instruction">
        <span>{audioReady ? "Audio en la app" : "Audio externo"}</span>
        <strong>{formatTime(state.startPosition)}</strong>
        <p>
          {audioReady
            ? "El anfitrión reproduce la pista; al 0 solo sigue la letra."
            : <>Busca <b>{formatTime(state.startPosition)}</b> si eres el anfitrión; dale play al llegar a 0.</>}
        </p>
      </div>
      <output className="countdown-number" aria-live="polite">{remaining || "YA"}</output>
      <p className="singer-call">
        <Mic2 /> {isRelay ? "Empieza" : "Canta"}: <strong>{playerName(state, openingPlayerId(state))}</strong>
      </p>
    </section>
  );
}

function Karaoke({ state, role, busy, error, onRecalibrate, hostAudio, clockOffsetMs = 0 }: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  busy: boolean;
  error: string;
  onRecalibrate: (delta: number) => void;
  hostAudio: HostAudio;
  clockOffsetMs?: number;
}) {
  const now = useClock(true, 80, clockOffsetMs);
  const song = state.song;
  if (!song) return <Notice message="No se encontró la canción de esta ronda." />;

  // El host ancla la letra a `audio.currentTime` (fuente real de verdad):
  // evita drift del reloj de pared frente al audio que realmente se oye.
  // Los jugadores siguen derivando la posición de `hostNow` + offset.
  const hostAudioPosition = role === "host" ? hostAudio.getCurrentTime() : null;
  const position = hostAudioPosition ?? getPlaybackPosition(state, now);
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
          <p>El navegador bloqueó el audio. Pulsa para arrancar la pista.</p>
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

function Reveal({ state, role, busy, error, onResolve }: {
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

function Voting({ state, role, clientId, busy, error, onVote }: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  clientId: string;
  busy: boolean;
  error: string;
  onVote: (yes: boolean) => void;
}) {
  const eligible = Math.max(0, state.players.length - 1);
  const count = Object.keys(state.votes).length;
  const voted = Object.hasOwn(state.votes, clientId);
  const singer = state.singerId === clientId;
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

function Score({ state, role, busy, error, onContinue }: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  busy: boolean;
  error: string;
  onContinue: () => void;
}) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  return (
    <section className="score-screen">
      <div className={`result-stamp ${state.lastResult ? "is-hit" : "is-miss"}`}>
        {state.lastResult ? <Check /> : <X />}
        <span>{state.lastResult ? "¡Punto!" : "Casi"}</span>
        <small>{playerName(state, state.singerId)}</small>
      </div>
      <div className="scoreboard">
        <span className="step-label"><Trophy size={18} /> Marcador</span>
        <ol>
          {sorted.map((player, index) => (
            <li key={player.id}><span>{index + 1}</span><strong>{player.name}</strong><b>{player.score} pts</b></li>
          ))}
        </ol>
      </div>
      {role === "host" ? (
        <ActionButton busy={busy} onClick={onContinue}>
          {state.round + 1 >= state.totalRounds ? "Ver resultado final" : "Siguiente ronda"} <ArrowRight />
        </ActionButton>
      ) : <p className="waiting-copy">El anfitrión prepara la siguiente ronda.</p>}
      {error && <Notice message={error} />}
    </section>
  );
}

function Finished({ state, role }: { state: RoomPublicState; role: Exclude<Role, null> }) {
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
          <p>¿Otra ronda? Crea una sala nueva para reiniciar el escenario.</p>
          <ActionButton onClick={() => window.location.reload()}><RotateCcw /> Crear nueva sala</ActionButton>
        </div>
      ) : <p className="waiting-copy">Gracias por subir al escenario.</p>}
    </section>
  );
}

function ConfigMissing() {
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

interface PendingRequest {
  resolve: (ack: RoomAck) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export default function App() {
  const credentials = useMemo(() => readSupabaseCredentials(), []);
  const [role, setRole] = useState<Role>(null);
  const [state, setState] = useState<RoomPublicState | null>(null);
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<ChannelStatus>("offline");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [librarySongs, setLibrarySongs] = useState<CloudSongRecord[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState("");
  const [pendingImportSong, setPendingImportSong] = useState<Song | null>(null);

  const applyChannelStatus = useCallback((next: ChannelStatus, _detail?: string) => {
    setStatus(next);
  }, []);

  const refreshLibrarySongs = useCallback(() => {
    setLibraryLoading(true);
    void listCloudSongs()
      .then((songs) => {
        setLibrarySongs(songs);
        setLibraryError("");
      })
      .catch((caught: unknown) => {
        setLibraryError(
          caught instanceof Error ? caught.message : "No se pudo cargar la biblioteca del grupo.",
        );
      })
      .finally(() => setLibraryLoading(false));
  }, []);

  useEffect(() => {
    if (!credentials) return;
    refreshLibrarySongs();
  }, [credentials, refreshLibrarySongs]);

  const engineRef = useRef<HostEngine | null>(null);
  const hostChannelRef = useRef<HostChannel | null>(null);
  const playerChannelRef = useRef<PlayerChannel | null>(null);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const hostAudio = useHostAudio();
  const clockOffsetMs = useHostClockOffset(state, role);
  const lastPhaseRef = useRef<RoomPublicState["phase"] | null>(null);
  const lastSongIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (role !== "host" || !state) return;
    if (state.phase === "ready" && state.song && state.song.id !== lastSongIdRef.current) {
      lastSongIdRef.current = state.song.id;
      hostAudio.clear();
      hostAudio.loadCatalog(state.song);
    }
  }, [role, state, hostAudio]);

  useEffect(() => {
    if (role !== "host" || !engineRef.current) return;
    engineRef.current.setHostHasAudio(hostAudio.hasAudio);
  }, [role, hostAudio.hasAudio]);

  useEffect(() => {
    if (role !== "host" || !state) return;
    const previousPhase = lastPhaseRef.current;
    lastPhaseRef.current = state.phase;
    if (state.phase === "playing" && previousPhase !== "playing") {
      void hostAudio.playFrom(state.startPosition);
    }
    if (
      (state.phase === "score" || state.phase === "reveal" || state.phase === "finished") &&
      previousPhase === "playing"
    ) {
      hostAudio.pause();
    }
  }, [role, state, hostAudio]);

  // Solo al desmontar la app. Depender de `hostAudio` (objeto nuevo cada render)
  // cerraba el canal Realtime al instante y dejaba la sala «Sin conexión».
  useEffect(
    () => () => {
      hostChannelRef.current?.close();
      playerChannelRef.current?.close();
      for (const pending of pendingRef.current.values()) clearTimeout(pending.timeout);
      hostAudio.clear();
    },
    // Solo al desmontar; `hostAudio.clear` es estable entre renders.
    [],
  );

  const resolvePending = useCallback((ack: RoomAck) => {
    const pending = pendingRef.current.get(ack.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingRef.current.delete(ack.requestId);
    pending.resolve(ack);
  }, []);

  const sendPlayerCommand = useCallback(
    (build: (requestId: string) => RoomCommand) =>
      new Promise<RoomAck>((resolve) => {
        const requestId = createRequestId();
        const timeout = setTimeout(() => {
          pendingRef.current.delete(requestId);
          resolve({
            requestId,
            ok: false,
            error: "El anfitrión no respondió. Verifica el código o pídele que vuelva a abrir la sala.",
          });
        }, ACK_TIMEOUT_MS);
        pendingRef.current.set(requestId, { resolve, timeout });
        playerChannelRef.current?.sendCommand(build(requestId));
      }),
    [],
  );

  const createRoom = useCallback(() => {
    if (!credentials) return;
    setError("");
    setStatus("connecting");
    const hostId = createRandomId();
    setClientId(hostId);
    setRole("host");

    const engine = createHostEngine(hostId, (nextState) => {
      setState(nextState);
      hostChannelRef.current?.broadcastState(nextState);
    });
    engine.registerSongs(librarySongs.map((record) => record.song));
    engineRef.current = engine;
    setState(engine.state);

    const channel = openHostChannel(engine.state.code, {
      onCommand: (command, meta) => {
        const ack = engine.handleRemoteCommand(command, meta);
        channel.broadcastAck(ack);
      },
      onPlayerLeft: (playerId) => engine.removePlayer(playerId),
      onStatusChange: (next, detail) => {
        applyChannelStatus(next, detail);
        if (next === "online") channel.broadcastState(engine.state);
      },
    });
    hostChannelRef.current = channel;
  }, [applyChannelStatus, credentials, librarySongs]);

  const joinRoom = useCallback(
    (name: string, code: string) => {
      if (!credentials) return;
      const trimmedName = name.trim();
      const roomCode = code.trim().toUpperCase();
      if (!trimmedName || roomCode.length !== 4) {
        setError("Escribe tu nombre y un código de 4 letras.");
        return;
      }
      setBusy(true);
      setError("");
      setStatus("connecting");

      const fail = (message: string) => {
        setBusy(false);
        setError(message);
        setRole(null);
        setStatus("offline");
      };

      try {
        const playerId = createRandomId();
        setClientId(playerId);
        setRole("player");

        const channel = openPlayerChannel(roomCode, playerId, {
          onState: (next) => {
            setState(next);
            setError("");
          },
          onAck: resolvePending,
          onHostLeft: () => {
            setState(null);
            setRole(null);
            setError("El anfitrión cerró la sala. Pídele un código nuevo cuando vuelva a abrirla.");
          },
          onStatusChange: applyChannelStatus,
        });
        playerChannelRef.current = channel;

        void channel
          .whenReady()
          .then(() =>
            sendPlayerCommand((requestId) => ({
              type: "join",
              requestId,
              playerId,
              name: trimmedName,
            })),
          )
          .then((ack) => {
            setBusy(false);
            if (!ack.ok) {
              channel.close();
              playerChannelRef.current = null;
              fail(ack.error);
            }
          })
          .catch((caught: unknown) => {
            channel.close();
            playerChannelRef.current = null;
            fail(
              caught instanceof Error
                ? caught.message
                : "No se pudo conectar. Revisa tu red e inténtalo de nuevo.",
            );
          });
      } catch (caught) {
        // Red de seguridad: cualquier fallo síncrono (ej. API no disponible en
        // este contexto/navegador) no debe dejar el botón girando para siempre.
        fail(caught instanceof Error ? caught.message : "Ocurrió un error inesperado al conectar.");
      }
    },
    [applyChannelStatus, credentials, resolvePending, sendPlayerCommand],
  );

  const runHostAction = useCallback((action: () => void) => {
    setError("");
    try {
      action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ocurrió un error inesperado");
    }
  }, []);

  const handleSongUploaded = useCallback(
    (song: Song) => {
      setShowUpload(false);
      refreshLibrarySongs();
      if (role === "host" && engineRef.current) {
        engineRef.current.registerSongs([song]);
        if (state?.phase === "lobby") {
          runHostAction(() => engineRef.current?.selectSongChoice(song.id));
        }
      }
    },
    [refreshLibrarySongs, role, runHostAction, state?.phase],
  );

  const handleExportSong = useCallback(
    (songId: string) => {
      const record = librarySongs.find((item) => item.song.id === songId);
      if (record) downloadUserSongJson(record.song);
    },
    [librarySongs],
  );

  const handleDeleteSong = useCallback(
    (songId: string, title: string) => {
      if (!window.confirm(`¿Eliminar "${title}" de la biblioteca? Se borra para todo el grupo.`)) return;
      setBusy(true);
      void deleteCloudSong(songId)
        .then(() => {
          setBusy(false);
          refreshLibrarySongs();
        })
        .catch((caught: unknown) => {
          setBusy(false);
          setError(caught instanceof Error ? caught.message : "No se pudo eliminar la canción.");
        });
      if (state?.selectedSongId === songId) {
        runHostAction(() => engineRef.current?.selectSongChoice(null));
      }
    },
    [refreshLibrarySongs, runHostAction, state?.selectedSongId],
  );

  const handleImportJsonFile = useCallback((file: File) => {
    void file
      .text()
      .then((raw) => {
        const result = parseUserSongJson(raw);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError("");
        setPendingImportSong(result.song);
      })
      .catch(() => setError("No se pudo leer el archivo JSON."));
  }, []);

  const handleCancelImport = useCallback(() => setPendingImportSong(null), []);

  const handleImportAudioFile = useCallback(
    (file: File) => {
      if (!pendingImportSong) return;
      const name = getStoredUploaderName() || window.prompt("Tu nombre, para la biblioteca:")?.trim() || "Anónimo";
      setStoredUploaderName(name);
      const song: Song = { ...pendingImportSong, audioSource: { type: "supabase", objectKey: pendingImportSong.id } };
      setBusy(true);
      setError("");
      void saveCloudSong(song, file, name)
        .then(() => {
          setBusy(false);
          setPendingImportSong(null);
          refreshLibrarySongs();
          if (role === "host") engineRef.current?.registerSongs([song]);
        })
        .catch((caught: unknown) => {
          setBusy(false);
          setError(caught instanceof Error ? caught.message : "No se pudo subir la canción importada.");
        });
    },
    [pendingImportSong, refreshLibrarySongs, role],
  );

  const castVote = useCallback(
    (yes: boolean) => {
      if (!clientId) return;
      setBusy(true);
      setError("");
      void sendPlayerCommand((requestId) => ({ type: "vote", requestId, playerId: clientId, yes })).then(
        (ack) => {
          setBusy(false);
          if (!ack.ok) setError(ack.error);
        },
      );
    },
    [clientId, sendPlayerCommand],
  );

  const screen = useMemo(() => {
    if (!credentials) return <ConfigMissing />;
    if (!role || !state) {
      return (
        <Home
          busyJoin={busy}
          error={error}
          librarySongs={librarySongs}
          libraryLoading={libraryLoading}
          libraryError={libraryError}
          onCreate={createRoom}
          onJoin={joinRoom}
          onOpenUpload={() => setShowUpload(true)}
          onDeleteSong={handleDeleteSong}
        />
      );
    }
    switch (state.phase) {
      case "lobby":
        return (
          <Lobby
            state={state}
            role={role}
            busy={busy}
            error={error}
            librarySongs={librarySongs}
            libraryError={libraryError}
            pendingImportSong={pendingImportSong}
            onConfig={(config) => runHostAction(() => engineRef.current!.configure(config))}
            onSelectSong={(songId) => runHostAction(() => engineRef.current!.selectSongChoice(songId))}
            onStart={(config) =>
              runHostAction(() => {
                engineRef.current!.configure(config);
                engineRef.current!.start();
              })
            }
            onOpenUpload={() => setShowUpload(true)}
            onExportSong={handleExportSong}
            onDeleteSong={handleDeleteSong}
            onImportJsonFile={handleImportJsonFile}
            onImportAudioFile={handleImportAudioFile}
            onCancelImport={handleCancelImport}
          />
        );
      case "ready":
        return (
          <Ready
            state={state}
            role={role}
            busy={busy}
            error={error}
            onCountdown={() => runHostAction(() => engineRef.current!.startCountdown())}
            hostAudio={hostAudio}
          />
        );
      case "countdown":
        return (
          <Countdown
            state={state}
            audioReady={state.hostHasAudio}
            clockOffsetMs={clockOffsetMs}
          />
        );
      case "playing":
        return (
          <Karaoke
            state={state}
            role={role}
            busy={busy}
            error={error}
            onRecalibrate={(delta) =>
              runHostAction(() => {
                engineRef.current!.recalibrate(delta);
                hostAudio.seekBy(delta / 1_000);
              })
            }
            hostAudio={hostAudio}
            clockOffsetMs={clockOffsetMs}
          />
        );
      case "reveal":
        return (
          <Reveal
            state={state}
            role={role}
            busy={busy}
            error={error}
            onResolve={(correct) => runHostAction(() => engineRef.current!.resolveManually(correct))}
          />
        );
      case "voting":
        return (
          <Voting state={state} role={role} clientId={clientId} busy={busy} error={error} onVote={castVote} />
        );
      case "score":
        return (
          <Score
            state={state}
            role={role}
            busy={busy}
            error={error}
            onContinue={() => runHostAction(() => engineRef.current!.continueRound())}
          />
        );
      case "finished":
        return <Finished state={state} role={role} />;
    }
  }, [
    busy,
    castVote,
    clientId,
    clockOffsetMs,
    createRoom,
    credentials,
    error,
    handleCancelImport,
    handleDeleteSong,
    handleExportSong,
    handleImportAudioFile,
    handleImportJsonFile,
    hostAudio,
    joinRoom,
    libraryError,
    libraryLoading,
    librarySongs,
    pendingImportSong,
    role,
    runHostAction,
    state,
  ]);

  return (
    <>
      <StageShell status={status} roomCode={state?.code}>
        {screen}
      </StageShell>
      {showUpload && (
        <UploadSongWizard onClose={() => setShowUpload(false)} onSaved={handleSongUploaded} />
      )}
    </>
  );
}
