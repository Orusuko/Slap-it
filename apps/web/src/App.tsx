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
  Star,
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
  genreLabel,
  getCurrentTurn,
  getDisplayPosition,
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
  getStoredUploaderName,
  listCloudSongs,
  saveCloudSong,
  setStoredUploaderName,
  type CloudSongRecord,
} from "./songs/cloudSongStore";
import {
  buildSetlist,
  defaultSetlistFilter,
  distinctGenres,
  distinctUploaders,
  type SetlistFilter,
} from "./songs/setlist";
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
}: {
  busyJoin: boolean;
  error: string;
  librarySongs: CloudSongRecord[];
  libraryLoading: boolean;
  libraryError: string;
  onCreate: () => void;
  onJoin: (name: string, code: string) => void;
  onOpenUpload: () => void;
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
                    <small>
                      {song.artist} · {genreLabel(song.genre)} · subida por {uploadedBy}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
            <p className="library-status">
              Solo lectura: si algo sobra, pídele al dueño del grupo que lo borre desde Supabase.
            </p>
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
  onSetlist,
  onStart,
  onOpenUpload,
  onExportSong,
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
  /** Ids resultantes del setlist actual (P5); `null` = sin restricción. */
  onSetlist: (songIds: string[] | null) => void;
  onStart: (config: GameConfig) => void;
  onOpenUpload: () => void;
  onExportSong: (songId: string) => void;
  onImportJsonFile: (file: File) => void;
  onImportAudioFile: (file: File) => void;
  onCancelImport: () => void;
}) {
  const [config, setConfig] = useState<GameConfig>(state.config);
  useEffect(() => setConfig(state.config), [state.config]);

  const patchConfig = <K extends keyof GameConfig>(key: K, value: GameConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));

  const [setlistFilter, setSetlistFilter] = useState<SetlistFilter>(defaultSetlistFilter());
  const setlistRecords = useMemo(
    () => librarySongs.map(({ song, uploadedBy }) => ({ song, uploadedBy })),
    [librarySongs],
  );
  const genres = useMemo(() => distinctGenres(setlistRecords), [setlistRecords]);
  const uploaders = useMemo(() => distinctUploaders(setlistRecords), [setlistRecords]);
  // Recorte por género/uploader antes de excluir canciones sueltas: es la lista que ve el toggle por tema.
  const genreAndUploaderFilter = useMemo<SetlistFilter>(
    () => ({ ...setlistFilter, excludedIds: new Set() }),
    [setlistFilter],
  );
  const candidateSongs = useMemo(
    () => buildSetlist(setlistRecords, genreAndUploaderFilter),
    [setlistRecords, genreAndUploaderFilter],
  );
  const setlistSongs = useMemo(
    () => buildSetlist(setlistRecords, setlistFilter),
    [setlistRecords, setlistFilter],
  );
  const setlistIds = useMemo(() => setlistSongs.map((song) => song.id), [setlistSongs]);

  // El host solo arma el setlist; se manda al motor apenas cambia, no hace
  // falta esperar a "Empezar show" (así el sorteo de la primera ronda ya lo respeta).
  useEffect(() => {
    onSetlist(librarySongs.length > 0 ? setlistIds : null);
  }, [onSetlist, setlistIds, librarySongs.length]);

  const toggleInSet = (current: "all" | ReadonlySet<string>, value: string, allValues: string[]): "all" | Set<string> => {
    const base = current === "all" ? new Set(allValues) : new Set(current);
    if (base.has(value)) base.delete(value);
    else base.add(value);
    return base.size >= allValues.length ? "all" : base;
  };

  const isGenreActive = (genre: string) => setlistFilter.genres === "all" || setlistFilter.genres.has(genre);
  const isUploaderActive = (name: string) => setlistFilter.uploaders === "all" || setlistFilter.uploaders.has(name);

  const toggleSong = (songId: string) => {
    setSetlistFilter((current) => {
      const next = new Set(current.excludedIds);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return { ...current, excludedIds: next };
    });
  };

  const toggleSinger = (playerId: string) => {
    patchConfig(
      "karaokeSingerIds",
      config.karaokeSingerIds.includes(playerId)
        ? config.karaokeSingerIds.filter((id) => id !== playerId)
        : [...config.karaokeSingerIds, playerId],
    );
  };

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
            <fieldset>
              <legend>Rondas de la noche</legend>
              <div className="number-stepper">
                <button type="button" aria-label="Reducir rondas" onClick={() => patchConfig("totalRounds", Math.max(1, config.totalRounds - 1))}><Minus /></button>
                <output>{config.totalRounds}</output>
                <button type="button" aria-label="Aumentar rondas" onClick={() => patchConfig("totalRounds", Math.min(12, config.totalRounds + 1))}><Plus /></button>
              </div>
              <p className="config-note">Los puntos se acumulan ronda a ronda; al terminar podrás pedir «Una más».</p>
            </fieldset>
            <Choice
              legend="Modo de canto"
              value={config.mode}
              options={[["relay", "Relevo + sorpresa"], ["individual", "Individual"], ["karaoke", "Karaoke por turnos"]]}
              onChange={(value) => patchConfig("mode", value as GameConfig["mode"])}
            />
            {config.mode === "relay" && (
              <p className="config-note">
                En relevo el apagón son 1–2 estrofas al azar tras las vueltas; no se configura por línea.
              </p>
            )}
            {config.mode === "individual" && (
              <Choice
                legend="Telón de apagón"
                value={config.blackoutDuration}
                options={[["line", "Una línea"], ["section", "Sección completa"]]}
                onChange={(value) => patchConfig("blackoutDuration", value as GameConfig["blackoutDuration"])}
              />
            )}
            {config.mode === "karaoke" ? (
              <fieldset className="singer-picker">
                <legend>¿Quién canta esta noche?</legend>
                <p className="config-note">
                  Letra siempre visible, sin apagón. Los no elegidos se quedan votando con estrellas.
                  Ninguno elegido = cantan todos, por turnos.
                </p>
                <div className="chip-row">
                  {state.players.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className={`chip ${config.karaokeSingerIds.includes(player.id) ? "is-active" : ""}`}
                      onClick={() => toggleSinger(player.id)}
                    >
                      {player.name}
                    </button>
                  ))}
                  {state.players.length === 0 && <span className="helper">Todavía no hay jugadores.</span>}
                </div>
              </fieldset>
            ) : (
              <>
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
              </>
            )}

            <div className="setlist-card">
              <span className="step-label"><ListMusic size={17} /> Setlist de la noche</span>
              {librarySongs.length === 0 ? (
                <p className="helper">Sube al menos una canción a la biblioteca para armar el setlist.</p>
              ) : (
                <>
                  <div className="setlist-group">
                    <span>Géneros</span>
                    <div className="chip-row">
                      {genres.map((genre) => (
                        <button
                          key={genre}
                          type="button"
                          className={`chip ${isGenreActive(genre) ? "is-active" : ""}`}
                          onClick={() =>
                            setSetlistFilter((current) => ({
                              ...current,
                              genres: toggleInSet(current.genres, genre, genres),
                            }))
                          }
                        >
                          {genreLabel(genre)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="setlist-group">
                    <span>Quién subió</span>
                    <div className="chip-row">
                      {uploaders.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={`chip ${isUploaderActive(name) ? "is-active" : ""}`}
                          onClick={() =>
                            setSetlistFilter((current) => ({
                              ...current,
                              uploaders: toggleInSet(current.uploaders, name, uploaders),
                            }))
                          }
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="setlist-group">
                    <span>Catálogo ({setlistSongs.length}/{candidateSongs.length})</span>
                    <ul className="setlist-songs">
                      {candidateSongs.map((song) => {
                        const included = !setlistFilter.excludedIds.has(song.id);
                        return (
                          <li key={song.id}>
                            <label className={included ? "is-included" : ""}>
                              <input type="checkbox" className="sr-only" checked={included} onChange={() => toggleSong(song.id)} />
                              <span>{included ? <Check size={14} /> : <X size={14} />}</span>
                              <strong>{song.title}</strong>
                              <small>{song.artist}</small>
                            </label>
                          </li>
                        );
                      })}
                      {candidateSongs.length === 0 && <li className="helper">Ningún tema con este género/uploader.</li>}
                    </ul>
                  </div>
                  {setlistSongs.length === 0 ? (
                    <p className="wizard-error">El setlist está vacío. Incluye al menos una canción.</p>
                  ) : (
                    <p className="helper">{setlistSongs.length} canción{setlistSongs.length === 1 ? "" : "es"} en el pool de esta noche.</p>
                  )}
                </>
              )}
            </div>

            <label className="song-pick">
              <span>Forzar canción en la próxima ronda (opcional)</span>
              <select
                value={state.selectedSongId ?? ""}
                onChange={(event) => onSelectSong(event.target.value || null)}
              >
                <option value="">Al azar (dentro del setlist)</option>
                {setlistSongs.length > 0 && (
                  <optgroup label="Setlist de esta noche">
                    {setlistSongs.map((song) => (
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
                <button type="button" onClick={() => onExportSong(state.selectedSongId!)}>
                  <Download size={15} /> Exportar
                </button>
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
                : state.config.mode === "karaoke"
                  ? "Modo: karaoke por turnos — letra siempre visible; al terminar, votan con estrellas."
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
  const isKaraoke = state.config.mode === "karaoke";
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

function Countdown({ state, role, busy, audioReady, hostAudio, onRetryPlayback, clockOffsetMs = 0 }: {
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
  // Con audio in-app, al llegar a "YA" el motor espera la confirmación real
  // de `play()` antes de marcar `playing` (fix de sync P5): puede tardar un
  // instante (o bloquearse por autoplay) sin que el 3-2-1 avance más.
  const waitingForAudio = role === "host" && audioReady && state.countdownEndsAt === null;
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
      {waitingForAudio && hostAudio.needsGesture && (
        <div className="autoplay-nudge">
          <p>El navegador bloqueó el audio. Pulsa para arrancar la pista.</p>
          <ActionButton busy={busy} onClick={onRetryPlayback}>Reproducir audio</ActionButton>
        </div>
      )}
      {waitingForAudio && !hostAudio.needsGesture && (
        <p className="waiting-copy">Arrancando el audio…</p>
      )}
      <p className="singer-call">
        <Mic2 /> {isRelay ? "Empieza" : "Canta"}: <strong>{playerName(state, openingPlayerId(state))}</strong>
      </p>
    </section>
  );
}

function Karaoke({ state, role, busy, error, onRecalibrate, onEndKaraokeTurn, hostAudio, clockOffsetMs = 0 }: {
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

function Voting({ state, role, clientId, busy, error, onVote, onVoteStars, onCloseKaraokeVoting }: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  clientId: string;
  busy: boolean;
  error: string;
  onVote: (yes: boolean) => void;
  onVoteStars: (stars: number) => void;
  onCloseKaraokeVoting: () => void;
}) {
  const isKaraoke = state.config.mode === "karaoke";
  const eligible = Math.max(0, state.players.length - 1);
  const singer = state.singerId === clientId;

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

function Score({ state, role, busy, error, onContinue, onExtendRound, onFinishShow }: {
  state: RoomPublicState;
  role: Exclude<Role, null>;
  busy: boolean;
  error: string;
  onContinue: () => void;
  onExtendRound: () => void;
  onFinishShow: () => void;
}) {
  const isKaraoke = state.config.mode === "karaoke";
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const isLastRound = state.round + 1 >= state.totalRounds;
  return (
    <section className="score-screen">
      {isKaraoke ? (
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

  // `hostAudio` es un objeto nuevo cada render: lo guardamos en un ref para
  // poder leerlo desde efectos/intervalos sin que se disparen en cada
  // publish() de la sala (el mismo problema que ya evita el efecto de abajo).
  const hostAudioRef = useRef(hostAudio);
  hostAudioRef.current = hostAudio;
  const lastCountdownEndsAtRef = useRef<number | null>(null);

  /**
   * Arranca (o reintenta) el audio del host y, en cuanto `play()` resuelve de
   * verdad, confirma al motor que la reproducción empezó (P5: fix de sync).
   * Es el único punto donde se dispara `hostConfirmPlaybackStarted`.
   */
  const attemptHostPlayback = useCallback(
    (fromSeconds: number) => {
      void hostAudioRef.current.playFrom(fromSeconds).then((started) => {
        if (!started) return; // needsGesture: el nudge de la UI reintenta con este mismo callback.
        const position = hostAudioRef.current.getCurrentTime() ?? fromSeconds;
        engineRef.current?.hostConfirmPlaybackStarted(position);
      });
    },
    [],
  );

  useEffect(() => {
    if (role !== "host" || !state) return;
    const previousPhase = lastPhaseRef.current;
    const previousCountdownEndsAt = lastCountdownEndsAtRef.current;
    lastPhaseRef.current = state.phase;
    lastCountdownEndsAtRef.current = state.countdownEndsAt;

    if (state.phase === "countdown" && previousPhase !== "countdown" && hostAudio.hasAudio) {
      // Deja el buffer caliente en el punto de arranque mientras corre el 3-2-1.
      hostAudio.warmUp(state.startPosition);
    }

    // El 3-2-1 visual llegó a "YA": si hay audio in-app, dispara `playFrom`
    // ahora; el motor no marca `playing` hasta que confirmemos que sonó.
    const countdownJustFinished =
      state.phase === "countdown" && state.countdownEndsAt === null && previousCountdownEndsAt !== null;
    if (countdownJustFinished && state.hostHasAudio) {
      attemptHostPlayback(state.startPosition);
    }

    if (
      (state.phase === "score" || state.phase === "reveal" || state.phase === "finished") &&
      previousPhase === "playing"
    ) {
      hostAudio.pause();
    }
  }, [role, state, hostAudio, attemptHostPlayback]);

  // Playhead periódico (P5): mientras suena, el host reporta su
  // `audio.currentTime` real para que los jugadores sigan el altavoz de la
  // TV en vez de su propio reloj de pared. No depende de `hostAudio`
  // completo (evitaría reiniciar el intervalo en cada render).
  useEffect(() => {
    if (role !== "host" || state?.phase !== "playing") return;
    const tick = () => {
      const position = hostAudioRef.current.getCurrentTime();
      if (position !== null) engineRef.current?.reportPlayhead(position);
    };
    tick();
    const interval = window.setInterval(tick, 700);
    return () => window.clearInterval(interval);
  }, [role, state?.phase]);

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

  // Sin `handleDeleteSong` a propósito (P5): nadie borra canciones desde la
  // app (ver `cloudSongStore.ts` y `supabase/schema.sql`).

  const handleSetlist = useCallback((songIds: string[] | null) => {
    runHostAction(() => engineRef.current?.setSetlist(songIds));
  }, [runHostAction]);

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

  const castStarVote = useCallback(
    (stars: number) => {
      if (!clientId) return;
      setBusy(true);
      setError("");
      void sendPlayerCommand((requestId) => ({ type: "voteStars", requestId, playerId: clientId, stars })).then(
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
            onSetlist={handleSetlist}
            onStart={(config) =>
              runHostAction(() => {
                engineRef.current!.configure(config);
                engineRef.current!.start();
              })
            }
            onOpenUpload={() => setShowUpload(true)}
            onExportSong={handleExportSong}
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
            role={role}
            busy={busy}
            audioReady={state.hostHasAudio}
            hostAudio={hostAudio}
            onRetryPlayback={() => attemptHostPlayback(state.startPosition)}
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
            onEndKaraokeTurn={() => runHostAction(() => engineRef.current!.endKaraokeTurn())}
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
          <Voting
            state={state}
            role={role}
            clientId={clientId}
            busy={busy}
            error={error}
            onVote={castVote}
            onVoteStars={castStarVote}
            onCloseKaraokeVoting={() => runHostAction(() => engineRef.current!.closeKaraokeVoting())}
          />
        );
      case "score":
        return (
          <Score
            state={state}
            role={role}
            busy={busy}
            error={error}
            onContinue={() => runHostAction(() => engineRef.current!.continueRound())}
            onExtendRound={() => runHostAction(() => engineRef.current!.extendRound())}
            onFinishShow={() => runHostAction(() => engineRef.current!.finishShow())}
          />
        );
      case "finished":
        return <Finished state={state} role={role} />;
    }
  }, [
    attemptHostPlayback,
    busy,
    castStarVote,
    castVote,
    clientId,
    clockOffsetMs,
    createRoom,
    credentials,
    error,
    handleCancelImport,
    handleExportSong,
    handleImportAudioFile,
    handleImportJsonFile,
    handleSetlist,
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
