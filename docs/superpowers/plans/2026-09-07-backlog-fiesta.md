# Backlog fiesta — P6 (2026-09-07)

Resumen de ejecución de las 8 olas del backlog de fiesta. UI en español.
Comportamiento de juego preservado salvo las entregas listadas.

## Ola 1 — Seguridad biblioteca

- Guardado cloud **INSERT-only** (sin UPDATE anónimo).
- Migración: [`supabase/migration-p6.sql`](../../../supabase/migration-p6.sql)
  (cerrar políticas UPDATE). Instalaciones nuevas: `schema.sql` ya alineado.
- Re-subir el mismo `id` falla; la app crea copia con id nuevo.

## Ola 2 — Setlist / filtros

- Filtro de **artista** en el setlist del lobby (además de género, uploader y exclusión por tema).
- Pool = género ∩ artista ∩ uploader − exclusiones.

## Ola 3 — Modo Adivina la canción

- Modo `guess`: clip 10 s desde estribillo, 4 opciones estilo Kahoot, puntos por velocidad.
- Plan detallado: [`2026-09-07-adivina-la-cancion.md`](./2026-09-07-adivina-la-cancion.md) (completado).

## Ola 4 — Restaurar host (F5)

- Snapshot del host en `sessionStorage` (`hostSnapshot.ts`).
- Recargar (F5) restaura la sala; **cerrar la pestaña** termina el show.

## Ola 5 — PIN opcional de biblioteca

- `VITE_LIBRARY_PIN`: freno de UI en el wizard de subida (no es auth real; la anon key sigue en el bundle).

## Ola 6 — Hardening / sync / calidad

- Playhead del host, ACK, Presence con gracia, tests de motor/setlist/guess, etc.

## Ola 7 — Código y docs

- Pantallas extraídas a `apps/web/src/screens/` (`App.tsx` = wiring Realtime/audio + switch).
- README + handoff actualizados; este documento.
- Comentario de `realtime/client.ts`: cliente también habla con Postgres/Storage.

## Ola 8 — Extras

- QR de sala en lobby host + prefijo `?room=XXXX` en Home.
- Reintento único de ACK en `sendPlayerCommand` si el host no responde a tiempo.
- README corto en `apps/server/` (snapshot pre-P5; no Pages; no paridad prod).
- **E2E Playwright:** opcional / fuera del CI de GitHub Pages.
- Script de preflight: omitido (demasiado complejo para el alcance).

## Pendiente humano

Pegar en el SQL Editor de Supabase (si aún no):

1. [`supabase/migration.sql`](../../../supabase/migration.sql) (P5: genre + sin DELETE)
2. [`supabase/migration-p6.sql`](../../../supabase/migration-p6.sql) (P6: INSERT-only / sin UPDATE)
