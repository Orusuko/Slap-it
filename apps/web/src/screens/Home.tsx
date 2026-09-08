import {
  ArrowRight,
  ChevronRight,
  Crown,
  Music2,
  Radio,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { genreLabel } from "@slay-it/shared";
import { readPlayerSession } from "../realtime/playerSession";
import type { CloudSongRecord } from "../songs/cloudSongStore";
import { ActionButton, Notice } from "./ui";

export function Home({
  busyJoin,
  error,
  librarySongs,
  libraryLoading,
  libraryError,
  onCreate,
  onJoin,
  onOpenUpload,
  onRefreshLibrary,
  idbSongCount,
  idbMigrateBusy,
  idbMigrateDone,
  idbMigrateError,
  onMigrateIdb,
  onClearIdbAfterMigrate,
}: {
  busyJoin: boolean;
  error: string;
  librarySongs: CloudSongRecord[];
  libraryLoading: boolean;
  libraryError: string;
  onCreate: () => void;
  onJoin: (name: string, code: string) => void;
  onOpenUpload: () => void;
  onRefreshLibrary: () => void;
  idbSongCount: number;
  idbMigrateBusy: boolean;
  idbMigrateDone: boolean;
  idbMigrateError: string;
  onMigrateIdb: () => void;
  onClearIdbAfterMigrate: () => void;
}) {
  const [name, setName] = useState(() => readPlayerSession()?.name ?? "");
  const [code, setCode] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("room");
    if (fromUrl) return fromUrl.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    return readPlayerSession()?.code ?? "";
  });

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
        {idbSongCount > 0 && (
          <div className="library-status" role="status">
            {idbMigrateDone ? (
              <>
                <p>Las {idbSongCount} canciones locales ya están en la nube.</p>
                <ActionButton type="button" variant="secondary" onClick={onClearIdbAfterMigrate}>
                  Borrar copias locales
                </ActionButton>
              </>
            ) : (
              <>
                <p>Subir a la nube estas {idbSongCount} canciones</p>
                {idbMigrateError && <p className="library-status is-error">{idbMigrateError}</p>}
                <ActionButton type="button" variant="secondary" busy={idbMigrateBusy} onClick={onMigrateIdb}>
                  Subir a la nube
                </ActionButton>
              </>
            )}
          </div>
        )}
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
              <button type="button" onClick={onRefreshLibrary} disabled={libraryLoading}>
                Actualizar biblioteca
              </button>
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
          <p className="library-status">
            Aún no hay canciones en la biblioteca. Sube la primera.{" "}
            <button type="button" onClick={onRefreshLibrary} disabled={libraryLoading}>
              Actualizar biblioteca
            </button>
          </p>
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
