import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getPlaybackPosition,
  type RoomPublicState,
  type Song,
} from "@slay-it/shared";
import { useHostAudio } from "./audio/useHostAudio";
import { createHostEngine, createHostEngineFromSnapshot, type HostEngine } from "./game/hostEngine";
import { libraryLoadErrorMessage } from "./game/canStartShow";
import { clearHostSnapshot, readHostSnapshot, writeHostSnapshot } from "./game/hostSnapshot";
import { readSupabaseCredentials } from "./realtime/env";
import { createRandomId, createRequestId, type RoomAck, type RoomCommand } from "./realtime/protocol";
import { clearPlayerSession, readPlayerSession, writePlayerSession } from "./realtime/playerSession";
import {
  openHostChannel,
  openPlayerChannel,
  type ChannelStatus,
  type HostChannel,
  type PlayerChannel,
} from "./realtime/roomChannel";
import {
  getCloudAudioUrl,
  getStoredUploaderName,
  listCloudSongs,
  saveCloudSong,
  setStoredUploaderName,
  type CloudSongRecord,
} from "./songs/cloudSongStore";
import { distinctArtists } from "./songs/setlist";
import { downloadUserSongJson, parseUserSongJson } from "./songs/songExport";
import { createUserSongId } from "./songs/userSong";
import {
  clearAllUserSongs,
  getUserSongAudioBlob,
  listUserSongs,
} from "./songs/userSongStore";
import { UploadSongWizard } from "./songs/UploadSongWizard";
import { Countdown } from "./screens/Countdown";
import { Finished } from "./screens/Finished";
import { Home } from "./screens/Home";
import { GuessListen, Karaoke, Reveal } from "./screens/Karaoke";
import { Lobby } from "./screens/Lobby";
import { Ready } from "./screens/Ready";
import { Score } from "./screens/Score";
import { Voting } from "./screens/Voting";
import { ConfigMissing, StageShell, type Role } from "./screens/ui";

const ACK_TIMEOUT_MS = 8_000;

/** Estima desfase host ↔ cliente a partir de `hostNow` en cada broadcast. */
function useHostClockOffset(state: RoomPublicState | null, role: Role) {
  const [offsetMs, setOffsetMs] = useState(0);
  useEffect(() => {
    if (role !== "player" || state?.hostNow == null) return;
    setOffsetMs(state.hostNow - Date.now());
  }, [role, state?.hostNow, state?.phase, state?.startedAt]);
  return role === "player" ? offsetMs : 0;
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
  const [editDraft, setEditDraft] = useState<{ song: Song; audioUrl: string | null } | null>(null);
  const [librarySongs, setLibrarySongs] = useState<CloudSongRecord[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState("");
  const [pendingImportSong, setPendingImportSong] = useState<Song | null>(null);
  const [idbSongCount, setIdbSongCount] = useState(0);
  const [idbMigrateBusy, setIdbMigrateBusy] = useState(false);
  const [idbMigrateDone, setIdbMigrateDone] = useState(false);
  const [idbMigrateError, setIdbMigrateError] = useState("");

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
        setLibraryError(libraryLoadErrorMessage(caught));
      })
      .finally(() => setLibraryLoading(false));
  }, []);

  useEffect(() => {
    if (!credentials) return;
    refreshLibrarySongs();
  }, [credentials, refreshLibrarySongs]);

  useEffect(() => {
    if (!credentials) return;
    const timer = window.setInterval(() => refreshLibrarySongs(), 30_000);
    return () => window.clearInterval(timer);
  }, [credentials, refreshLibrarySongs]);

  useEffect(() => {
    void listUserSongs()
      .then((records) => setIdbSongCount(records.length))
      .catch(() => setIdbSongCount(0));
  }, []);

  const engineRef = useRef<HostEngine | null>(null);
  const hostChannelRef = useRef<HostChannel | null>(null);
  const playerChannelRef = useRef<PlayerChannel | null>(null);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const hostAudio = useHostAudio();
  const clockOffsetMs = useHostClockOffset(state, role);
  const lastPhaseRef = useRef<RoomPublicState["phase"] | null>(null);
  const lastSongIdRef = useRef<string | null>(null);
  const hostBootRef = useRef(false);
  const needsPlaybackResumeRef = useRef(false);

  const persistHostState = useCallback((engine: HostEngine, nextState: RoomPublicState) => {
    setState(nextState);
    hostChannelRef.current?.broadcastState(nextState);
    const snapshot = engine.exportSnapshot();
    if (snapshot) writeHostSnapshot(snapshot);
  }, []);

  useEffect(() => {
    if (role !== "host" || !engineRef.current) return;
    engineRef.current.registerSongs(librarySongs.map((record) => record.song));
  }, [role, librarySongs]);

  useEffect(() => {
    if (role !== "host" || !state) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [role, state]);

  useEffect(() => {
    if (role === "player" && state?.phase === "finished") {
      clearPlayerSession();
    }
  }, [role, state?.phase]);

  useEffect(() => {
    if (role !== "host" || !state?.song) return;
    const livePhases = new Set(["ready", "countdown", "playing"]);
    if (!livePhases.has(state.phase)) return;
    if (state.song.id === lastSongIdRef.current) return;
    lastSongIdRef.current = state.song.id;
    hostAudio.clear();
    hostAudio.loadCatalog(state.song);
  }, [role, state, hostAudio]);

  useEffect(() => {
    if (role !== "host" || !engineRef.current) return;
    engineRef.current.setHostHasAudio(hostAudio.hasAudio);
  }, [role, hostAudio.hasAudio]);

  useEffect(() => {
    if (role !== "host" || !state || !needsPlaybackResumeRef.current) return;
    if (!hostAudio.hasAudio) return;
    needsPlaybackResumeRef.current = false;
    if (state.phase === "playing") {
      void hostAudio.playFrom(getPlaybackPosition(state));
      return;
    }
    if (state.phase === "countdown" && state.countdownEndsAt === null) {
      void hostAudio.playFrom(state.startPosition).then((started) => {
        if (!started) return;
        const position = hostAudio.getCurrentTime() ?? state.startPosition;
        engineRef.current?.hostConfirmPlaybackStarted(position);
      });
    }
  }, [role, state, hostAudio]);

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
      (state.phase === "score" ||
        state.phase === "reveal" ||
        state.phase === "voting" ||
        state.phase === "finished") &&
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
    (build: (requestId: string) => RoomCommand) => {
      const attempt = () =>
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
        });

      return attempt().then(async (ack) => {
        if (ack.ok) return ack;
        // Un reintento si el ACK expiró; luego falla.
        if (!ack.error.includes("no respondió")) return ack;
        return attempt();
      });
    },
    [],
  );

  const attachHostChannel = useCallback(
    (engine: HostEngine) => {
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
    },
    [applyChannelStatus],
  );

  const createRoom = useCallback(() => {
    if (!credentials) return;
    clearHostSnapshot();
    setError("");
    setStatus("connecting");
    const hostId = createRandomId();
    setClientId(hostId);
    setRole("host");

    const engine = createHostEngine(hostId, (nextState) => persistHostState(engine, nextState));
    engine.registerSongs(librarySongs.map((record) => record.song));
    engineRef.current = engine;
    persistHostState(engine, engine.state);
    attachHostChannel(engine);
  }, [attachHostChannel, credentials, librarySongs, persistHostState]);

  const restoreHost = useCallback(
    (snapshot: ReturnType<typeof readHostSnapshot>) => {
      if (!credentials || !snapshot) return;
      setError("");
      setStatus("connecting");
      setClientId(snapshot.hostId);
      setRole("host");
      needsPlaybackResumeRef.current =
        snapshot.state.phase === "playing" ||
        (snapshot.state.phase === "countdown" && snapshot.state.countdownEndsAt === null);

      const engine = createHostEngineFromSnapshot(snapshot, (nextState) =>
        persistHostState(engine, nextState),
      );
      engine.registerSongs(librarySongs.map((record) => record.song));
      engineRef.current = engine;
      persistHostState(engine, engine.state);
      attachHostChannel(engine);
    },
    [attachHostChannel, credentials, librarySongs, persistHostState],
  );

  useEffect(() => {
    if (!credentials || hostBootRef.current) return;
    hostBootRef.current = true;
    const snapshot = readHostSnapshot();
    if (snapshot) restoreHost(snapshot);
  }, [credentials, restoreHost]);

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
        const stored = readPlayerSession();
        const playerId =
          stored && stored.code === roomCode ? stored.playerId : createRandomId();
        setClientId(playerId);
        setRole("player");

        const channel = openPlayerChannel(roomCode, playerId, {
          onState: (next) => {
            setState(next);
            setError("");
          },
          onAck: resolvePending,
          onHostLeft: () => {
            clearPlayerSession();
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
            } else {
              writePlayerSession({ code: roomCode, playerId, name: trimmedName });
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
      setEditDraft(null);
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

  const closeUploadWizard = useCallback(() => {
    setShowUpload(false);
    setEditDraft(null);
  }, []);

  const handleEditSync = useCallback(
    (songId: string) => {
      const record = librarySongs.find((item) => item.song.id === songId);
      if (!record) return;
      const objectKey =
        record.song.audioSource?.type === "supabase"
          ? record.song.audioSource.objectKey
          : record.song.id;
      setBusy(true);
      setError("");
      void getCloudAudioUrl(objectKey)
        .then((url) => {
          setEditDraft({ song: record.song, audioUrl: url });
          setShowUpload(true);
        })
        .catch(() => {
          setEditDraft({ song: record.song, audioUrl: null });
          setShowUpload(true);
        })
        .finally(() => setBusy(false));
    },
    [librarySongs],
  );

  const handleMigrateIdb = useCallback(() => {
    setIdbMigrateBusy(true);
    setIdbMigrateError("");
    void (async () => {
      try {
        const records = await listUserSongs();
        const uploader = getStoredUploaderName() || "Migración local";
        for (const record of records) {
          const blob = await getUserSongAudioBlob(record.song.id);
          if (!blob) continue;
          const id = createUserSongId();
          const song: Song = {
            ...record.song,
            id,
            audioSource: { type: "supabase", objectKey: id },
          };
          const file = new File([blob], `${song.title || id}.mp3`, {
            type: blob.type || "audio/mpeg",
          });
          await saveCloudSong(song, file, uploader);
        }
        setIdbMigrateDone(true);
        refreshLibrarySongs();
      } catch (caught) {
        setIdbMigrateError(
          caught instanceof Error ? caught.message : "No se pudieron subir las canciones locales.",
        );
      } finally {
        setIdbMigrateBusy(false);
      }
    })();
  }, [refreshLibrarySongs]);

  const handleClearIdbAfterMigrate = useCallback(() => {
    void clearAllUserSongs()
      .then(() => {
        setIdbSongCount(0);
        setIdbMigrateDone(false);
      })
      .catch(() => {
        setIdbMigrateError("No se pudieron borrar las copias locales.");
      });
  }, []);

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

  const castGuessAnswer = useCallback(
    (optionId: string) => {
      if (!clientId) return;
      setBusy(true);
      setError("");
      void sendPlayerCommand((requestId) => ({
        type: "answer",
        requestId,
        playerId: clientId,
        optionId,
      })).then((ack) => {
        setBusy(false);
        if (!ack.ok) setError(ack.error);
      });
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
          onOpenUpload={() => {
            setEditDraft(null);
            setShowUpload(true);
          }}
          onRefreshLibrary={refreshLibrarySongs}
          idbSongCount={idbSongCount}
          idbMigrateBusy={idbMigrateBusy}
          idbMigrateDone={idbMigrateDone}
          idbMigrateError={idbMigrateError}
          onMigrateIdb={handleMigrateIdb}
          onClearIdbAfterMigrate={handleClearIdbAfterMigrate}
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
            libraryLoading={libraryLoading}
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
            onOpenUpload={() => {
              setEditDraft(null);
              setShowUpload(true);
            }}
            onEditSync={handleEditSync}
            onRefreshLibrary={refreshLibrarySongs}
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
        return state.config.mode === "guess" ? (
          <GuessListen
            state={state}
            role={role}
            busy={busy}
            hostAudio={hostAudio}
            clockOffsetMs={clockOffsetMs}
          />
        ) : (
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
            onAnswer={castGuessAnswer}
            onCloseKaraokeVoting={() => runHostAction(() => engineRef.current!.closeKaraokeVoting())}
            onCloseGuessVoting={() => runHostAction(() => engineRef.current!.closeGuessVoting())}
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
        return (
          <Finished
            state={state}
            role={role}
            onResetToLobby={() => runHostAction(() => engineRef.current!.resetToLobby())}
          />
        );
    }
  }, [
    attemptHostPlayback,
    busy,
    castGuessAnswer,
    castStarVote,
    castVote,
    clientId,
    clockOffsetMs,
    createRoom,
    credentials,
    error,
    handleCancelImport,
    handleClearIdbAfterMigrate,
    handleEditSync,
    handleExportSong,
    handleImportAudioFile,
    handleImportJsonFile,
    handleMigrateIdb,
    handleSetlist,
    hostAudio,
    idbMigrateBusy,
    idbMigrateDone,
    idbMigrateError,
    idbSongCount,
    joinRoom,
    libraryError,
    libraryLoading,
    librarySongs,
    pendingImportSong,
    refreshLibrarySongs,
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
        <UploadSongWizard
          key={editDraft?.song.id ?? "new-upload"}
          knownArtists={distinctArtists(librarySongs.map(({ song, uploadedBy }) => ({ song, uploadedBy })))}
          initialSong={editDraft?.song ?? null}
          initialAudioUrl={editDraft?.audioUrl ?? null}
          onClose={closeUploadWizard}
          onSaved={handleSongUploaded}
        />
      )}
    </>
  );
}

