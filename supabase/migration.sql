-- Slay It — migración P5 (sobre un proyecto que YA corrió schema.sql de P4)
--
-- Pega este archivo en Supabase → SQL Editor → New query → Run.
-- No recrea tablas, bucket ni políticas de SELECT/INSERT/UPDATE.
-- Es seguro volver a correrlo (IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- Si el proyecto es nuevo y nunca corriste schema.sql, usa
-- supabase/schema.sql en su lugar (incluye estos cambios).

-- 1. Género: columna + índice. Canciones ya subidas quedan en 'otro'.
alter table public.songs
  add column if not exists genre text not null default 'otro';

create index if not exists songs_genre_idx
  on public.songs (genre);

comment on table public.songs is
  'Biblioteca colaborativa de canciones de Slay It. `song` guarda el objeto Song completo (letra, timings, secciones). `genre` duplica `song->>genre` en columna para poder filtrar/indexar sin parsear JSON.';

-- 2. Quitar borrado público. El dueño borra desde el dashboard, no la app.
drop policy if exists "songs_delete_all" on public.songs;
drop policy if exists "song_audio_delete_all" on storage.objects;
