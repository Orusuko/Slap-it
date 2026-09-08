import {
  Check,
  Download,
  FileUp,
  ListMusic,
  LoaderCircle,
  Mic2,
  Minus,
  Music2,
  Plus,
  Settings2,
  Sparkles,
  Vote,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  genreLabel,
  relayWillBeShort,
  type GameConfig,
  type RoomPublicState,
  type Song,
} from "@slay-it/shared";
import { canStartShow } from "../game/canStartShow";
import type { CloudSongRecord } from "../songs/cloudSongStore";
import {
  buildSetlist,
  defaultSetlistFilter,
  distinctArtists,
  distinctGenres,
  distinctUploaders,
  filterSongsByQuery,
  type SetlistFilter,
} from "../songs/setlist";
import {
  ActionButton,
  Choice,
  Notice,
  PlayerList,
  RoomQr,
  partySongs,
  type Role,
} from "./ui";

export function Lobby({
  state,
  role,
  busy,
  error,
  librarySongs,
  libraryError,
  libraryLoading,
  pendingImportSong,
  onConfig,
  onSelectSong,
  onSetlist,
  onStart,
  onOpenUpload,
  onEditSync,
  onRefreshLibrary,
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
  libraryLoading: boolean;
  pendingImportSong: Song | null;
  onConfig: (config: GameConfig) => void;
  onSelectSong: (songId: string | null) => void;
  /** Ids resultantes del setlist actual (P5); `null` = sin restricción. */
  onSetlist: (songIds: string[] | null) => void;
  onStart: (config: GameConfig) => void;
  onOpenUpload: () => void;
  onEditSync: (songId: string) => void;
  onRefreshLibrary: () => void;
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
  const [setlistQuery, setSetlistQuery] = useState("");
  const setlistRecords = useMemo(
    () => librarySongs.map(({ song, uploadedBy }) => ({ song, uploadedBy })),
    [librarySongs],
  );
  const genres = useMemo(() => distinctGenres(setlistRecords), [setlistRecords]);
  const artists = useMemo(() => distinctArtists(setlistRecords), [setlistRecords]);
  const uploaders = useMemo(() => distinctUploaders(setlistRecords), [setlistRecords]);
  // Recorte por género/artista/uploader antes de excluir canciones sueltas: es la lista que ve el toggle por tema.
  const genreAndUploaderFilter = useMemo<SetlistFilter>(
    () => ({ ...setlistFilter, excludedIds: new Set() }),
    [setlistFilter],
  );
  const candidateSongs = useMemo(
    () => buildSetlist(setlistRecords, genreAndUploaderFilter),
    [setlistRecords, genreAndUploaderFilter],
  );
  const visibleCandidates = useMemo(
    () => filterSongsByQuery(candidateSongs, setlistQuery),
    [candidateSongs, setlistQuery],
  );
  const setlistSongs = useMemo(
    () => buildSetlist(setlistRecords, setlistFilter),
    [setlistRecords, setlistFilter],
  );
  const setlistIds = useMemo(() => setlistSongs.map((song) => song.id), [setlistSongs]);
  // Con biblioteca activa el pool de guess es el setlist (como poolFor del motor).
  const guessCatalogCount = useMemo(
    () => (librarySongs.length > 0 ? setlistSongs.length : partySongs.length),
    [librarySongs.length, setlistSongs.length],
  );
  const forcedSong = useMemo(() => {
    const id = state.selectedSongId;
    if (!id) return null;
    return (
      setlistSongs.find((song) => song.id === id) ??
      librarySongs.find((record) => record.song.id === id)?.song ??
      partySongs.find((song) => song.id === id) ??
      null
    );
  }, [state.selectedSongId, setlistSongs, librarySongs]);

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
  const isArtistActive = (name: string) => setlistFilter.artists === "all" || setlistFilter.artists.has(name);
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
        {role === "host" && <RoomQr code={state.code} />}
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
              legend="Modo de juego"
              value={config.mode}
              options={[
                ["relay", "Relevo + sorpresa"],
                ["individual", "Individual"],
                ["karaoke", "Karaoke por turnos"],
                ["guess", "Adivina la canción"],
              ]}
              onChange={(value) => patchConfig("mode", value as GameConfig["mode"])}
            />
            {config.mode === "relay" && (
              <p className="config-note">
                En relevo el apagón son 1–2 estrofas al azar tras las vueltas; no se configura por línea.
              </p>
            )}
            {config.mode === "relay" && forcedSong && relayWillBeShort(forcedSong, state.players.length) && (
              <p className="wizard-error">
                Con {state.players.length} jugadores, «{forcedSong.title}» tiene pocas estrofas: el relevo quedará corto.
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
            {config.mode === "guess" ? (
              <>
                <p className="config-note">
                  Suena el instrumental 10 s desde el estribillo. Luego 4 opciones en el teléfono.
                  Quien acierte más rápido suma más puntos.
                </p>
                {guessCatalogCount < 4 && (
                  <p className="wizard-error">
                    Se necesitan al menos 4 canciones en la biblioteca para Adivina la canción.
                  </p>
                )}
              </>
            ) : config.mode === "karaoke" ? (
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
              <div className="song-pick-tools" style={{ marginBottom: 8 }}>
                <button type="button" onClick={onRefreshLibrary} disabled={libraryLoading}>
                  Actualizar biblioteca
                </button>
              </div>
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
                    <span>Artistas</span>
                    <div className="chip-row">
                      {artists.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={`chip ${isArtistActive(name) ? "is-active" : ""}`}
                          onClick={() =>
                            setSetlistFilter((current) => ({
                              ...current,
                              artists: toggleInSet(current.artists, name, artists),
                            }))
                          }
                        >
                          {name}
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
                    <div className="field">
                      <label htmlFor="setlist-search" className="sr-only">Buscar en el setlist</label>
                      <input
                        id="setlist-search"
                        type="search"
                        value={setlistQuery}
                        onChange={(event) => setSetlistQuery(event.target.value)}
                        placeholder="Buscar por título o artista"
                      />
                    </div>
                    <ul className="setlist-songs">
                      {visibleCandidates.map((song) => {
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
                      {visibleCandidates.length === 0 && (
                        <li className="helper">
                          {candidateSongs.length === 0
                            ? "Ningún tema con este género/artista/uploader."
                            : "Ningún tema coincide con la búsqueda."}
                        </li>
                      )}
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
                <>
                  <button type="button" onClick={() => onEditSync(state.selectedSongId!)}>
                    Editar sync
                  </button>
                  <button type="button" onClick={() => onExportSong(state.selectedSongId!)}>
                    <Download size={15} /> Exportar
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
            <ActionButton
              type="submit"
              busy={busy}
              disabled={
                !canStartShow({
                  playerCount: state.players.length,
                  mode: config.mode,
                  guessCatalogCount,
                  setlistCount: setlistSongs.length,
                  hasLibrary: librarySongs.length > 0,
                })
              }
            >
              <Mic2 size={20} /> Empezar show
            </ActionButton>
            {state.players.length < 2 && <p className="helper">Se necesitan al menos 2 jugadores.</p>}
            {librarySongs.length > 0 && setlistSongs.length === 0 && (
              <p className="helper">El setlist está vacío. Incluye al menos una canción.</p>
            )}
            {config.mode === "guess" && guessCatalogCount < 4 && (
              <p className="helper">Adivina la canción necesita al menos 4 temas en la biblioteca.</p>
            )}
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
                  : state.config.mode === "guess"
                    ? "Modo: Adivina la canción — 10 s de instrumental y 4 opciones en el teléfono."
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
