-- Slay It P6 — cerrar UPDATE anónimo (INSERT-only)
--
-- Proyecto que YA corrió schema.sql / migration.sql de P5: pega esto en
-- SQL Editor → Run. No reabre DELETE.
-- Instalación NUEVA: usa supabase/schema.sql actualizado (ya sin UPDATE).
--
-- Tras esto, `saveCloudSong` solo puede INSERT. Re-subir el mismo `id`
-- falla; la app guarda una copia con id nuevo. Huérfanos de Storage tras
-- un insert fallido no se pueden borrar con la anon key (a propósito).

drop policy if exists "songs_update_all" on public.songs;
drop policy if exists "song_audio_update_all" on storage.objects;
