-- Slay It — biblioteca de canciones colaborativa (P4)
--
-- Pega este archivo completo en Supabase → SQL Editor → New query → Run.
-- Es seguro volver a correrlo (usa IF NOT EXISTS / ON CONFLICT en todo).
--
-- Diseño deliberado: sin login. Cualquiera con la anon key del proyecto
-- (que ya viaja en el bundle público de la app) puede leer, subir y borrar
-- canciones de la tabla `songs` y del bucket `song-audio`. Es el modelo
-- "biblioteca compartida entre amigos de confianza", no un backend público.
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

comment on table public.songs is
  'Biblioteca colaborativa de canciones de Slay It. `song` guarda el objeto Song completo (letra, timings, secciones).';

-- Acelera "¿ya existe esta canción?" al subir (case-insensitive).
create index if not exists songs_title_artist_idx
  on public.songs (lower(title), lower(artist));

create index if not exists songs_created_at_idx
  on public.songs (created_at desc);

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

drop policy if exists "songs_delete_all" on public.songs;
create policy "songs_delete_all"
  on public.songs for delete
  to anon, authenticated
  using (true);

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

drop policy if exists "song_audio_delete_all" on storage.objects;
create policy "song_audio_delete_all"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'song-audio');

-- ============================================================
-- 3. Después de correr esto
-- ============================================================
-- 1. Storage → song-audio → Configuration → CORS: añade el origen de tu
--    GitHub Pages (p. ej. https://tu-usuario.github.io) y
--    http://localhost:5173 para desarrollo.
-- 2. No hace falta Realtime en esta tabla: la app relista al abrir
--    Home/Lobby y tras subir/borrar una canción.
