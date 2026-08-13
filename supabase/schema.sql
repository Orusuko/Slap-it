-- Slay It — biblioteca de canciones colaborativa (P4 + P5)
--
-- Instalación NUEVA: pega este archivo en Supabase → SQL Editor → Run.
-- Proyecto que YA corrió el schema de P4: usa supabase/migration.sql
-- (solo columna genre + quitar políticas DELETE).
-- Es seguro volver a correrlo (usa IF NOT EXISTS / ON CONFLICT en todo).
--
-- Diseño deliberado: sin login. Cualquiera con la anon key del proyecto
-- (que ya viaja en el bundle público de la app) puede leer y subir
-- canciones a la tabla `songs` y al bucket `song-audio`. Es el modelo
-- "biblioteca compartida entre amigos de confianza", no un backend público.
--
-- P5: NADIE borra canciones desde la app (ni siquiera quien las subió). La
-- app ya no expone ningún botón de borrado y las políticas `DELETE` se
-- quitaron a propósito de `songs` y `storage.objects`. El dueño del
-- proyecto borra filas en Table Editor y objetos en Storage desde el
-- dashboard cuando haga falta.
--
-- `UPDATE` se deja abierto porque `saveCloudSong` usa `upsert` (permite
-- volver a subir el MP3 de una canción ya importada sin que falle por
-- conflicto de `id`); si prefieres cerrarlo también, cambia el guardado a
-- `insert` puro y trata el conflicto de id como error.
--
-- Si el grupo deja de ser de confianza, añade Supabase Auth y cambia estas
-- políticas para exigir `authenticated`.

-- ============================================================
-- 1. Tabla `songs`
-- ============================================================

create table if not exists public.songs (
  id text primary key,
  title text not null,
  artist text not null,
  duration numeric not null,
  uploaded_by text not null default 'Anónimo',
  song jsonb not null,
  created_at timestamptz not null default now()
);

-- P5: género de `SONG_GENRES` (packages/shared/src/model.ts). Canciones
-- subidas antes de P5 quedan con el default `'otro'` (la app las muestra
-- como «Otro»); no se migran a ciegas, re-súbelas o edita el JSONB a mano
-- si quieres reclasificarlas.
alter table public.songs add column if not exists genre text not null default 'otro';

comment on table public.songs is
  'Biblioteca colaborativa de canciones de Slay It. `song` guarda el objeto Song completo (letra, timings, secciones). `genre` duplica `song->>genre` en columna para poder filtrar/indexar sin parsear JSON.';

-- Acelera "¿ya existe esta canción?" al subir (case-insensitive).
create index if not exists songs_title_artist_idx
  on public.songs (lower(title), lower(artist));

create index if not exists songs_created_at_idx
  on public.songs (created_at desc);

create index if not exists songs_genre_idx
  on public.songs (genre);

alter table public.songs enable row level security;

drop policy if exists "songs_select_all" on public.songs;
create policy "songs_select_all"
  on public.songs for select
  to anon, authenticated
  using (true);

drop policy if exists "songs_insert_all" on public.songs;
create policy "songs_insert_all"
  on public.songs for insert
  to anon, authenticated
  with check (true);

drop policy if exists "songs_update_all" on public.songs;
create policy "songs_update_all"
  on public.songs for update
  to anon, authenticated
  using (true)
  with check (true);

-- P5: sin política DELETE a propósito. No la vuelvas a crear "por si acaso".
drop policy if exists "songs_delete_all" on public.songs;

-- ============================================================
-- 2. Bucket de Storage `song-audio`
-- ============================================================
-- Privado (public = false): no se puede listar ni descargar por URL directa
-- sin pasar por `createSignedUrl`. La app pide una URL firmada (~1h) cada
-- vez que el host carga una canción de la biblioteca.

insert into storage.buckets (id, name, public, file_size_limit)
values ('song-audio', 'song-audio', false, 12582912) -- 12 MB
on conflict (id) do update set public = false, file_size_limit = 12582912;

drop policy if exists "song_audio_select_all" on storage.objects;
create policy "song_audio_select_all"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'song-audio');

drop policy if exists "song_audio_insert_all" on storage.objects;
create policy "song_audio_insert_all"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'song-audio');

drop policy if exists "song_audio_update_all" on storage.objects;
create policy "song_audio_update_all"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'song-audio')
  with check (bucket_id = 'song-audio');

-- P5: sin política DELETE a propósito. No la vuelvas a crear "por si acaso".
drop policy if exists "song_audio_delete_all" on storage.objects;

-- ============================================================
-- 3. Después de correr esto
-- ============================================================
-- 1. Storage → song-audio → Configuration → CORS: añade el origen de tu
--    GitHub Pages (p. ej. https://tu-usuario.github.io) y
--    http://localhost:5173 para desarrollo.
-- 2. No hace falta Realtime en esta tabla: la app relista al abrir
--    Home/Lobby y tras subir una canción.
-- 3. Para borrar una canción: Table Editor → `songs` → borra la fila, y
--    Storage → `song-audio` → borra el objeto con la misma key (el `id` de
--    la canción). Ya no se puede hacer desde la app ni con la anon key.
