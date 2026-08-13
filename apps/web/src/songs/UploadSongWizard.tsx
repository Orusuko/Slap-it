import {
  ArrowLeft,
  ArrowRight,
  Check,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Save,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { getLyricWindow, SONG_GENRES, SONG_GENRE_LABELS, type Song, type SongGenre } from "@slay-it/shared";
import { cloudSongExists, getStoredUploaderName, saveCloudSong, setStoredUploaderName } from "./cloudSongStore";
import { parseLyrics } from "./parseLyrics";
import {
  beginTapSync,
  buildLinesFromTapSync,
  createTapSyncState,
  finishTapSync,
  isTapSyncDone,
  isTapSyncStarted,
  restartTapSync,
  tapNext,
  undoTapSync,
  type TapSyncState,
} from "./tapSync";
import { assembleUserSong, createUserSongId } from "./userSong";

type WizardStep = "meta" | "lyrics" | "chorus" | "sync";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function UploadSongWizard({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (song: Song) => void;
}) {
  const [step, setStep] = useState<WizardStep>("meta");

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState<SongGenre>("otro");
  const [uploaderName, setUploaderName] = useState(() => getStoredUploaderName());
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [metaError, setMetaError] = useState("");
  const objectUrlRef = useRef<string | null>(null);

  const [lyricsText, setLyricsText] = useState("");
  const lines = useMemo(() => parseLyrics(lyricsText), [lyricsText]);

  const [chorusLines, setChorusLines] = useState<Set<number>>(new Set());
  const toggleChorusLine = (index: number) => {
    setChorusLines((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };
  // Si se edita la letra y cambia el número de líneas, los índices marcados
  // quedarían apuntando a otro texto: es más seguro reiniciar la marca.
  useEffect(() => {
    setChorusLines(new Set());
  }, [lines.length]);

  const [tapState, setTapState] = useState<TapSyncState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveStage, setSaveStage] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(picked);
    objectUrlRef.current = url;
    setFile(picked);
    setObjectUrl(url);
    setDuration(null);
    setMetaError("");
    if (!title.trim()) setTitle(picked.name.replace(/\.[^.]+$/, ""));

    const probe = new Audio();
    probe.preload = "metadata";
    probe.addEventListener(
      "loadedmetadata",
      () => {
        setDuration(Number.isFinite(probe.duration) ? probe.duration : null);
        if (!Number.isFinite(probe.duration)) {
          setMetaError("No se pudo leer la duración de este archivo.");
        }
      },
      { once: true },
    );
    probe.addEventListener(
      "error",
      () => setMetaError("No se pudo leer este archivo de audio."),
      { once: true },
    );
    probe.src = url;
  };

  const canContinueMeta = Boolean(
    file && title.trim() && artist.trim() && uploaderName.trim() && duration && !metaError,
  );
  const canContinueLyrics = lines.length > 0;
  const canContinueChorus = chorusLines.size > 0;

  const startSyncStep = () => {
    setTapState(createTapSyncState(lines));
    setIsPlaying(false);
    setPlayhead(0);
    setPreviewing(false);
    setStep("sync");
  };

  useEffect(() => {
    if (step !== "sync") {
      audioRef.current?.pause();
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }, [step]);

  const started = tapState ? isTapSyncStarted(tapState) : false;
  const done = tapState ? isTapSyncDone(tapState) : false;
  const currentIndex = tapState?.openIndex ?? -1;
  const currentLine = started && !done ? lines[currentIndex] ?? null : null;
  const nextLine = !started ? lines[0] ?? null : !done ? lines[currentIndex + 1] ?? null : null;
  const previousLine = started && !done && currentIndex > 0 ? lines[currentIndex - 1] : null;
  const lineNumber = !started ? 1 : done ? lines.length : currentIndex + 1;

  const previewLines = useMemo(() => {
    if (!tapState || !isTapSyncDone(tapState)) return null;
    try {
      return buildLinesFromTapSync(tapState, "preview");
    } catch {
      return null;
    }
  }, [tapState]);
  const previewWindow =
    previewing && previewLines ? getLyricWindow({ lines: previewLines }, playhead) : null;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => {});
    else audio.pause();
  };

  const handleCentralTap = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const atSeconds = audio.currentTime;
    setTapState((current) => {
      if (!current) return current;
      if (!isTapSyncStarted(current)) return beginTapSync(current, atSeconds);
      if (!isTapSyncDone(current)) return tapNext(current, atSeconds);
      return current;
    });
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setTapState((current) => {
      if (!current || !isTapSyncStarted(current) || isTapSyncDone(current)) return current;
      const audio = audioRef.current;
      return finishTapSync(current, audio?.duration ?? audio?.currentTime ?? 0);
    });
  };

  const handleUndo = () => {
    setPreviewing(false);
    setTapState((current) => (current ? undoTapSync(current) : current));
  };
  const handleRestart = () => {
    setPreviewing(false);
    setTapState((current) => (current ? restartTapSync(current) : current));
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    }
  };

  const handlePreview = () => {
    if (!done) return;
    setPreviewing(true);
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  };

  const handleSave = async () => {
    if (!tapState || !file || !isTapSyncDone(tapState)) return;
    const name = uploaderName.trim();
    if (!name) {
      setSaveError("Escribe tu nombre antes de guardar.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveStage("");
    try {
      const id = createUserSongId();
      const songLines = buildLinesFromTapSync(tapState, id);
      const song = assembleUserSong({
        id,
        title,
        artist,
        duration: duration ?? songLines.at(-1)!.end,
        lines: songLines,
        chorusLineIndices: chorusLines,
        audioSource: { type: "supabase", objectKey: id },
        genre,
      });

      const alreadyExists = await cloudSongExists(title, artist).catch(() => false);
      if (
        alreadyExists &&
        !window.confirm(
          `Ya hay una canción "${title} — ${artist}" en la biblioteca del grupo. ¿Subir otra copia?`,
        )
      ) {
        setSaving(false);
        return;
      }

      await saveCloudSong(song, file, name, (stage) =>
        setSaveStage(stage === "uploading" ? "Subiendo audio…" : "Guardando en la biblioteca…"),
      );
      setStoredUploaderName(name);
      onSaved(song);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar la canción.");
    } finally {
      setSaving(false);
      setSaveStage("");
    }
  };

  const stepIndex = step === "meta" ? 0 : step === "lyrics" ? 1 : step === "chorus" ? 2 : 3;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Sube tu canción">
      <div className="wizard-modal">
        <header className="wizard-header">
          <span className="step-label"><Music2 size={18} /> Sube tu canción</span>
          <button type="button" className="wizard-close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        <div className="wizard-steps-dots" aria-hidden="true">
          {["Audio", "Letra", "Estribillo", "Sincronía"].map((label, index) => (
            <span key={label} className={index === stepIndex ? "is-active" : index < stepIndex ? "is-done" : ""}>
              {label}
            </span>
          ))}
        </div>

        <p className="wizard-hint">
          Se guardará en la biblioteca compartida de Supabase: tus amigos la verán desde cualquier
          dispositivo, no solo en este navegador.
        </p>

        {step === "meta" && (
          <div className="wizard-body">
            <label className="audio-attach wizard-file">
              <Upload size={16} />
              <span>{file ? file.name : "Elegir archivo de audio (MP3, etc.)"}</span>
              <input type="file" accept="audio/*" onChange={handleFileChange} />
            </label>
            {duration != null && <p className="wizard-hint">Duración detectada: {formatTime(duration)}</p>}
            {metaError && <p className="wizard-error">{metaError}</p>}
            <div className="field">
              <label htmlFor="song-title">Título</label>
              <input id="song-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Mi canción favorita" maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="song-artist">Artista</label>
              <input id="song-artist" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Ej. Grupo o solista" maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="song-genre">Género</label>
              <select id="song-genre" value={genre} onChange={(e) => setGenre(e.target.value as SongGenre)}>
                {SONG_GENRES.map((value) => (
                  <option key={value} value={value}>
                    {SONG_GENRE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="song-uploader">Tu nombre</label>
              <input
                id="song-uploader"
                value={uploaderName}
                onChange={(e) => setUploaderName(e.target.value)}
                placeholder="Quién sube esta canción"
                maxLength={24}
              />
            </div>
            <div className="wizard-footer">
              <span />
              <button type="button" className="button button--primary" disabled={!canContinueMeta} onClick={() => setStep("lyrics")}>
                Continuar <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === "lyrics" && (
          <div className="wizard-body">
            <p className="wizard-hint">Escribe o pega la letra: cada línea del cuadro será una línea de karaoke.</p>
            <textarea
              className="lyrics-textarea"
              value={lyricsText}
              onChange={(e) => setLyricsText(e.target.value)}
              placeholder={"Yo soy el aventurero\nel mundo me importa poco\n..."}
              rows={12}
            />
            <p className="wizard-hint">{lines.length} línea{lines.length === 1 ? "" : "s"} lista{lines.length === 1 ? "" : "s"}.</p>
            <div className="wizard-footer">
              <button type="button" className="button button--secondary" onClick={() => setStep("meta")}>
                <ArrowLeft size={18} /> Atrás
              </button>
              <button type="button" className="button button--primary" disabled={!canContinueLyrics} onClick={() => setStep("chorus")}>
                Continuar <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === "chorus" && (
          <div className="wizard-body">
            <p className="wizard-hint">
              Toca las líneas que son estribillo. Si se repite en varias partes de la canción,
              márcalo cada vez que aparezca.
            </p>
            <ul className="chorus-picker">
              {lines.map((line, index) => {
                const active = chorusLines.has(index);
                return (
                  <li key={index}>
                    <label className={active ? "is-chorus" : ""}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={active}
                        onChange={() => toggleChorusLine(index)}
                      />
                      <span className="chorus-picker-index">{index + 1}</span>
                      <span className="chorus-picker-text">{line}</span>
                      <span className="chorus-picker-flag">
                        {active ? <><Check size={13} /> Estribillo</> : "Marcar"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className={`chorus-summary ${chorusLines.size > 0 ? "is-active" : ""}`}>
              <Music2 size={15} />
              <span>
                {chorusLines.size === 0
                  ? "Marca al menos una línea para continuar."
                  : `${chorusLines.size} línea${chorusLines.size === 1 ? "" : "s"} marcada${chorusLines.size === 1 ? "" : "s"} como estribillo.`}
              </span>
            </div>
            <div className="wizard-footer">
              <button type="button" className="button button--secondary" onClick={() => setStep("lyrics")}>
                <ArrowLeft size={18} /> Atrás
              </button>
              <button type="button" className="button button--primary" disabled={!canContinueChorus} onClick={startSyncStep}>
                Continuar <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === "sync" && tapState && (
          <div className="wizard-body">
            <audio
              ref={audioRef}
              src={objectUrl ?? undefined}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={handleEnded}
              onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
            />
            <div className="tap-transport">
              <button type="button" className="tap-play" onClick={togglePlay} aria-label={isPlaying ? "Pausar" : "Reproducir"}>
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <span className="tap-time">{formatTime(playhead)} / {formatTime(duration ?? 0)}</span>
              <span className="tap-progress">Línea {lineNumber} / {lines.length}</span>
            </div>

            <p className="wizard-hint">
              {previewing
                ? "Preescucha: la línea grande solo aparece cuando llega su tiempo grabado."
                : started
                  ? "Pulsa cuando termine la línea grande. Una pulsación por cada línea del editor, no por estrofa."
                  : "El audio ya suena. Pulsa Empezar cuando empiece a cantarse la primera línea."}
            </p>

            <div className="tap-stage">
              {previewWindow ? (
                <>
                  <p className="tap-line tap-line--prev">{previewWindow.previous?.text ?? " "}</p>
                  <p className="tap-line tap-line--current">{previewWindow.current?.text ?? "Prepárate…"}</p>
                  <p className="tap-line tap-line--next">{previewWindow.next?.text ?? " "}</p>
                </>
              ) : (
                <>
                  <p className="tap-line tap-line--prev">{previousLine ?? " "}</p>
                  {done ? (
                    <p className="tap-line tap-line--current tap-line--done"><Check size={28} /> ¡Sincronización completa!</p>
                  ) : (
                    <p className="tap-line tap-line--current">
                      {currentLine ?? (started ? "…" : "Pulsa Empezar cuando empiece a cantarse la primera línea")}
                    </p>
                  )}
                  <p className="tap-line tap-line--next">{done ? " " : nextLine ?? " "}</p>
                </>
              )}
            </div>

            <button type="button" className="tap-central-button" disabled={done} onClick={handleCentralTap}>
              {!started ? "Empezar" : done ? "Completado" : "Siguiente línea"}
            </button>

            <div className="tap-controls">
              <button type="button" onClick={handleUndo} disabled={!started}>
                <Undo2 size={16} /> Deshacer
              </button>
              <button type="button" onClick={handleRestart} disabled={!started}>
                <RotateCcw size={16} /> Reiniciar
              </button>
              <button type="button" onClick={handlePreview} disabled={!done}>
                <Play size={16} /> Probar letra
              </button>
            </div>

            {saveError && <p className="wizard-error">{saveError}</p>}

            <div className="wizard-footer">
              <button type="button" className="button button--secondary" onClick={() => { setPreviewing(false); setStep("chorus"); }}>
                <ArrowLeft size={18} /> Atrás
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={!done || saving}
                onClick={() => void handleSave()}
              >
                {saving ? saveStage || "Guardando…" : <>Guardar <Save size={18} /></>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
