# Plan / Prompt de handoff — Slay It

> Documento listo para pegar a otra IA (p. ej. Claude Opus).  
> **Estado:** P0 + P1 + P3 + P4 + **P5 hechos** (biblioteca cloud + estribillo + setlist/rondas/karaoke/sync/sin borrado público).  
> **Pendiente humano:** volver a pegar `supabase/schema.sql` en el SQL Editor de Supabase (quita las políticas `DELETE`, añade la columna `genre`). Sin esto, P5 no queda activo en producción aunque el código ya esté desplegado.

---

## Cómo usar este archivo

Copia desde **«PROMPT PARA LA IA»** hasta el final de esa sección.  
Implementar de punta a punta en el repo existente. No reescribir la arquitectura de partida.

---

## PROMPT PARA LA IA

### Rol

Ingeniero senior full-stack sobre **Slay It** (repo monorepo existente).  
No reescribas la arquitectura de juego: **host autoritativo + Supabase Realtime (Broadcast/Presence) + deploy GitHub Pages**.  
La biblioteca de canciones **ya vive** en Postgres + Storage del mismo proyecto Supabase (P4 hecho).  
UI en **español**. Sin APIs Spotify/Apple Music para play/pause/seek.  
Respeta el estilo del código existente; cambios enfocados; tests en verde.

### Contexto del producto

- Karaoke de fiesta: TV/PC = anfitrión (audio + control); móviles = jugadores (letra + votos).  
- El catálogo estático (`demoSongs`) está **vacío**. Las canciones reales salen del wizard «Sube tu canción» y viven en la **biblioteca cloud** (tabla `songs` + bucket `song-audio`).  
- Cualquiera del grupo puede **subir** canciones desde cualquier dispositivo. **Nadie** debe poder borrarlas desde la app: el dueño las borra en el dashboard de Supabase.  
- El host de cada partida arma un **setlist de esa noche** (género + quién subió + excluir temas sueltos) para no mezclar gustos del grupo A con el B.  
- Multijugador: canal Realtime por código de sala (esto no cambia).  
- GitHub Pages ya inyecta `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

### Completado (no reimplementar, no revertir)

```powershell
npm test
npm run typecheck
npm run lint
npm run build:web
```

| Entrega | Estado |
|---------|--------|
| Relevo + sorpresa, badge, anti-spoiler, defaults | Hecho |
| Audio probe + adjunto + autoplay nudge | Hecho |
| Presence con gracia, join tras `whenReady()`, `hostNow` | Hecho |
| Wizard: audio + letra + estribillo + tap-sync + guardar en Supabase | Hecho |
| `audioSource.type === "supabase"` + URL firmada en `useHostAudio` | Hecho |
| `RoomManager.registerSongs` + selector lobby (biblioteca cloud) | Hecho |
| Letra del host anclada a `audio.currentTime` vía `getLyricWindow` | Hecho — **no adelantar** la próxima línea en intro/preroll |
| Calibración ±0.1 s y ±0.5 s | Hecho (ajuste fino; **no** basta para el delay de ~2 s de P5) |
| Tap-sync UX: autoplay al entrar, **Empezar** solo marca, **Siguiente línea**, contador, **Probar letra** | Hecho — **no volver** a `play()` + `beginTapSync` en t=0 |
| Paso Estribillo: filas táctiles (número + píldora «Marcar» / «Estribillo»), no checkboxes nativos | Hecho |
| SQL `supabase/schema.sql` (tabla + bucket + RLS) | Hecho — P5 **cambia** las políticas DELETE |

Archivos clave: `apps/web/src/App.tsx`, `apps/web/src/realtime/*`, `apps/web/src/audio/useHostAudio.ts`, `apps/web/src/game/hostEngine.ts`, `apps/web/src/songs/*` (`UploadSongWizard.tsx`, `cloudSongStore.ts`, `chorusRanges.ts`, `tapSync.ts`, `userSong.ts`), `packages/shared/src/{engine,model,catalog,game,relay}.ts`, `supabase/schema.sql`.

### Cómo está hoy (extender, no tirar)

- **Biblioteca:** `cloudSongStore.ts` lista/guarda/borra en Supabase. Home y Lobby leen la nube. IndexedDB (`userSongStore.ts`) ya no es fuente de verdad.  
- **Borrado público (quitar en P5):** hay papelera en Home y botón «Eliminar» en el lobby; `deleteCloudSong` + RLS `DELETE` para `anon`. Quitar UI **y** políticas: el dueño borra en el dashboard.  
- **Género:** `Song.genre` existe (string). El wizard lo hardcodea a `"custom"`. No hay filtro en el lobby.  
- **Uploader:** `uploaded_by` ya está en la fila y se muestra en Home. No hay filtro en el lobby.  
- **Selector de canción:** un `<select>` (azar / una canción). No hay setlist ni exclusión múltiple.  
- **Rondas:** relevo → `totalRounds = 1` (una canción y se acaba). Individual → `totalRounds = players.length`. Finished solo ofrece «Crear nueva sala» (se pierden los puntos).  
- **Modos:** `individual` | `relay`. No hay karaoke sin apagón ni voto de estrellas. Voto actual: `Record<string, boolean>` (sí/no) → +1 punto.  
- **Sync (bug real):** el host ancla la letra a `audio.currentTime`; los móviles derivan de `startedAt` + `hostNow`. El motor pone `phase = "playing"` y `startedAt = Date.now()` **antes** de que `playFrom()` resuelva. Con audio de Storage (URL firmada) el buffer de la 1ª vez suele ser 0.5–2 s. Los móviles oyen **la TV del host**, no un MP3 propio. `hostNow` no se manda en continuo, solo en cada `publish()`.

---

### ENTREGA PRINCIPAL — P5: Setlist + rondas + karaoke + sync + sin borrado público

Objetivo: que el host arme **la noche** (qué géneros, de quién, qué temas), juegue **varias rondas acumulando puntos**, tenga un modo **karaoke por turnos** con voto de estrellas, y que la letra de los móviles **siga el altavoz de la TV**. Nadie borra canciones desde la app.

**Orden de implementación (obligatorio):**

1. Seguridad: quitar borrado de la UI + cerrar RLS `DELETE`.  
2. Sync del playhead (si no, el resto se siente mal).  
3. Género en wizard + setlist del lobby (género ∩ uploader − excluidas).  
4. Rondas N + puntos acumulados + «Una más» / «Terminar show».  
5. Modo karaoke (turnos + estrellas + el host elige cantantes).

No entregues 5 si 1–4 no están verdes. 1 y 2 pueden ir en el mismo PR lógico; 3 y 4 juntos; 5 al final.

---

#### 1. Quitar borrado público (UI + RLS)

**Problema:** quitar el botón no basta. La anon key va en el bundle; hoy `anon` puede `DELETE` en `songs` y en `storage.objects` del bucket `song-audio`.

**App:**

- Quitar papelera de Home y el botón «Eliminar» del lobby.  
- Quitar handlers `handleDeleteSong` / `onDeleteSong`.  
- Quitar (o dejar de exportar/usar) `deleteCloudSong` en `cloudSongStore.ts`. No dejes un camino de borrado desde el cliente.  
- Home sigue listando la biblioteca (título, artista, quién subió) **solo lectura**. Copy: las canciones las limpia el dueño del proyecto en Supabase, no desde la app.

**SQL** (`supabase/schema.sql`, y el humano **vuelve a pegarlo** en el SQL Editor):

- `DROP POLICY` de `songs_delete_all` y `song_audio_delete_all`. **No** las vuelvas a crear.  
- Deja `SELECT` + `INSERT` para `anon` y `authenticated` (seguir subiendo).  
- Cierra también `UPDATE` en tabla y bucket para `anon` si la app no edita canciones (hoy no hace falta overwrite salvo el `upsert` de `saveCloudSong`: si el upsert necesita `UPDATE`, deja `songs_update_all` **o** cambia el save a `insert` y trata el conflicto de id como error). Documenta la decisión.  
- Storage: `SELECT` + `INSERT` para firmar URL y subir MP3. Sin `DELETE` para `anon`.

**README + notas humanas:** el dueño borra filas en Table Editor y objetos en Storage. Quien tenga la URL **sigue pudiendo subir**; ya no puede borrar.

Tests: no hace falta test de red; sí que la UI no renderice controles de borrar (grep / no props).

---

#### 2. Sync: la letra de los móviles sigue el altavoz del host

**Diagnóstico (no lo “arregles” con más calibración ±0.5 s):**

Hay dos relojes. El host usa `audio.currentTime`. Los jugadores usan pared (`getPlaybackPosition` = `startPosition + (now - startedAt) + offset`). El motor publica `playing` + `startedAt` y **después** React llama `playFrom()`. Con URL firmada de Storage la 1ª reproducción bufferiza ~0.5–2 s. Los móviles oyen la TV; si su letra va por pared, se desfasán.

Pruebas reales: 1ª vez el host iba con delay y los móviles no; 2ª vez (audio en caché) el host iba bien y los móviles no. Encaja con este modelo.

**Contrato nuevo:**

1. **No marcar `startedAt` ni publicar `playing` “a ciegas” hasta que el audio del host esté sonando.**  
   - El countdown 3-2-1 puede seguir igual.  
   - Al llegar a 0: el host llama `playFrom(startPosition)` y espera a que `play()` resuelva (y, si está disponible, al evento `playing`).  
   - **Entonces** el motor pone `phase = "playing"`, `startedAt = Date.now()`, `hostPlayhead` = `audio.currentTime`, y publica.  
   - Si `play()` es bloqueado por autoplay, el nudge «Reproducir audio» ya existe: al pulsar, mismo flujo (play → luego `startedAt`).  
   - Los móviles **no** deben pintar letra de `playing` con un `startedAt` anterior al altavoz.

2. **Playhead periódico durante `playing`.**  
   - El host, cada ~400–600 ms (y al recalibrar), publica en el estado (o en un evento de broadcast ligero) algo equivalente a:  
     `{ hostPlayhead: number /* segundos de audio.currentTime */, hostNow: number }`.  
   - Los móviles: `position = hostPlayhead + (Date.now() + clockOffsetMs - hostNow) / 1000`.  
   - Fuente de verdad = el MP3 de la TV, no el reloj de pared.  
   - El host **sigue** anclando su propia letra a `audio.currentTime` (no interpolar el playhead publicado consigo mismo).  
   - No satures Realtime: 2–3 mensajes/s máximo en este canal; el resto del juego ya limita `eventsPerSecond`.

3. **Warm-up en countdown.**  
   - En Ready ya hay probe. En countdown, si hay `<audio>` cargado, `preload` / `currentTime = startPosition` para que al 0 no bufferice de cero. No hace falta `play()` audible durante el 3-2-1 si el autoplay lo impide; al menos deja el buffer caliente.

4. **Calibración ±0.1 / ±0.5 s:** se queda como ajuste fino. Debe hacer `seekBy` en el audio del host **y** el siguiente tick de playhead debe llevar el `currentTime` nuevo a los móviles. No la uses como parche del delay de arranque.

Extiende `RoomPublicState` con `hostPlayhead: number | null` (o el nombre que documentes). Actualiza `getPlaybackPosition` o añade `getDisplayPosition(state, now, role)` para no duplicar fórmulas. Tests unitarios del cálculo (playhead + elapsed). Un test del motor: `startedAt` no se asigna en el callback del countdown **antes** de un “audio ready” inyectable (puedes pasar un hook/`waitUntilPlaying` al `RoomManager` o mover el “go playing” a un método `hostConfirmPlaybackStarted()` que el host llama tras `play()`).

**No** reescribas `planRelay`. **No** cambies `getLyricWindow` (current vacío en intro).

---

#### 3. Género en el wizard + columna para filtrar

Hoy `assembleUserSong` pone `genre: "custom"`. Todas las canciones cloud actuales salen en el mismo saco hasta recategorizarlas.

- Lista **cerrada** (no texto libre). Sugerida, en español, editable en un solo módulo (`SONG_GENRES`):  
  `banda`, `mariachi`, `ranchera`, `norteno`, `cumbia`, `pop`, `rock`, `balada`, `reggaeton`, `otro`.  
  Labels UI: Banda, Mariachi, Ranchera, Norteño, Cumbia, Pop, Rock, Balada, Reggaetón, Otro.  
- Paso **Audio** del wizard: select obligatorio de género (junto a título / artista / nombre).  
- `assembleUserSong` recibe `genre` y lo persiste en `Song.genre`.  
- Tabla `songs`: añade columna `genre text not null default 'otro'` (o el default que elijas). El SQL debe ser **re-ejecutable** (`add column if not exists`). `saveCloudSong` escribe `genre` en la fila **y** dentro del JSONB. `listCloudSongs` puede filtrar en cliente (el catálogo es pequeño); la columna evita parsear JSON si más adelante hay query.  
- Canciones ya subidas: quedan en `custom` / `otro`. No migres a ciegas. En el setlist, `custom` cuenta como «Otro» o aparece como género propio «Sin clasificar» — elige uno y documenta. El dueño puede re-subir o editar el JSONB a mano.

Tests: `assembleUserSong` respeta el género pasado; el schema Zod acepta los valores del enum (cambia `genre: z.string().min(1)` a `z.enum(SONG_GENRES)` **o** deja string y valida en el wizard; preferible enum compartido en `packages/shared` para que lobby y wizard no se desfasen).

---

#### 4. Setlist del host (género ∩ uploader − excluidas)

El lobby deja de ser “una canción o todo el azar”. El host arma el **pool de esa partida**.

**UI (solo host, en el lobby), tres controles que se combinan:**

1. **Géneros** — chips. Por defecto «Todos». Desmarcar = excluir ese género.  
2. **Quién subió** — chips con los `uploaded_by` distintos de la biblioteca. Por defecto todos. Desmarcar un nombre = no usar las canciones de esa persona (grupo B vs grupo A).  
3. **Catálogo** — lista ya recortada por 1 y 2, con toggle por canción. Por defecto **todas las del recorte incluidas**. El host desmarca temas sueltos (le gusta *una* de B, no el resto).

Fórmula: `(géneros activos) ∩ (uploaders activos) − (ids desmarcados)`.

- Si el pool queda vacío, no se puede «Empezar show»; copy claro: “El setlist está vacío. Incluye al menos una canción.”  
- El `<select>` actual de “una canción / al azar” se **reemplaza o se subsume**:  
  - Azar = sorteo **dentro del setlist**, no de toda la biblioteca.  
  - Si el host quiere forzar un tema concreto para la **próxima** ronda, puede pinnearlo (opcional); si complica, omite el pin y que el sorteo + exclusión baste.  
- `registerSongs` / `selectSong` / `usedSongIds` deben sortear **solo del pool**, no de `demoSongs` vacío + toda la nube. Pasa el setlist al motor al dar a Empezar (p. ej. `start(config, { songIds: string[] })` o `setPlaylist(ids)`).  
- El setlist es de **esa sala**, no se guarda en Supabase.  
- Los jugadores no configuran el setlist; pueden ver cuántas canciones hay en el pool si queda limpio.

Tests puros: función `buildSetlist(songs, { genres, uploaders, excludedIds })` → ids. Casos: todos, excluir un género, excluir un uploader, excluir un id, intersección vacía.

---

#### 5. Varias rondas acumulando puntos

Hoy relevo = 1 ronda y Finished sin “seguir”. Individual = 1 ronda por jugador. No hay forma de una noche con 5 canciones y un ganador.

**Lobby (host):**

- Stepper **Rondas: 1–12**, default **5** (o 3 si te parece menos agresivo; documenta el default). Aplica a **todos** los modos (relay, individual, karaoke).  
- `totalRounds` deja de inferirse solo del modo. `start()` usa `config.totalRounds` (añádelo a `GameConfig`).  
- Individual: si `totalRounds` < número de jugadores, no todos cantan; si es mayor, se cicla. No fuerces `totalRounds = players.length`.

**Tras cada ronda (pantalla Score):**

- Puntos **se acumulan** en `player.score` (como hoy).  
- Si `round + 1 < totalRounds`: botón **«Siguiente ronda»** (sortea otra canción del setlist, sin repetir hasta agotar; si se agota, rebaraja o permite repetir — documenta; preferible no repetir y si no quedan, avisar y dejar «Terminar show»).  
- Si ya se llegó a N: botones **«Una más»** (incrementa `totalRounds` en 1 y prepara ronda) y **«Terminar show»** (pasa a `finished`).  
- **«Terminar show»** también visible antes de N, por si la fiesta se corta.

**Finished:**

- Podio con puntos acumulados de **toda** la noche.  
- Sigue existiendo «Crear nueva sala» (reset total). No es el único camino.

Tests del motor: `totalRounds` configurable; `continue` no manda a finished si quedan rondas; «una más» incrementa y llama `prepareRound`; `usedSongIds` evita repetir mientras haya pool.

---

#### 6. Modo karaoke por turnos (después de 1–5)

Nuevo `config.mode: "karaoke"`. **No** es un parche del apagón: es otro flujo.

**Reglas:**

- Letra **siempre visible** (no `blackout`, no máscara). No uses `selectBlackout`.  
- El host, en el lobby (o en Ready, si cabe mejor), elige **qué jugadores cantan** esta noche: uno, varios o todos. Los no elegidos siguen en la sala y **votan**. Mínimo 1 cantante.  
- Turno = **canción completa para un cantante** (más claro en fiesta que partir por estrofas). El setlist sortea la canción; el host puede reordenar cantantes si queda limpio; si no, orden de la lista de seleccionados.  
- Tras la canción: fase de voto **1–5 estrellas** (no sí/no). El cantante no vota. Hace falta al menos 1 voto de un no-cantante (o el host, si no hay otros).  
- Puntos: **suma de estrellas** de esa ronda (entero, comparable). Alternativa aceptable: promedio × 10 redondeado. Elige una, tests, copy en UI (“Cada estrella suma 1 punto”).  
- `lastResult` booleano no sirve; guarda `lastStars: number | null` (promedio o suma, coherente con lo que muestras) y en Score enseña las estrellas de esa ronda + marcador acumulado.  
- `votes`: hoy `Record<string, boolean>`. Extiende a `Record<string, number>` (1–5) **o** un campo paralelo `starVotes` para no romper individual/relay. Preferible campo paralelo si el sí/no de relevo se mantiene intacto.  
- Individual y relay **no cambian** su voto sí/no ni el +1 del apagón.

**UI:**

- Lobby: tercer modo «Karaoke por turnos» junto a Relevo / Individual. Si karaoke está activo, oculta telón de apagón y máscara (no aplican). Muestra selector de cantantes (checkboxes/chips de `state.players`).  
- Ready/Countdown: “Canta: {nombre}” como hoy.  
- Playing: letra completa, sin blackout.  
- Voting: 5 estrellas táctiles en el móvil; el host ve el recuento.  
- Score: estrellas de la ronda + tabla de puntos.

Tests: modo karaoke no genera `blackout`; solo los no-cantantes votan; puntuación se suma; `planRelay` no se llama.

---

#### 7. Documentación

Actualiza `README.md` y las notas humanas al final de este archivo:

1. Volver a pegar `supabase/schema.sql` (políticas DELETE fuera; columna `genre` si aplica).  
2. El dueño borra canciones en el dashboard, no en la app.  
3. Wizard pide género. Canciones viejas = «Otro» / «Sin clasificar».  
4. Lobby: setlist (género, uploader, excluir temas) + número de rondas.  
5. Sync: los móviles siguen el playhead del host; si hay delay, no “calibrar 2 s a mano” como solución.  
6. Modo karaoke: letra visible, estrellas, el host elige quién canta.  
7. CORS / secrets de Pages: sin cambios respecto a P4.

---

#### Fuera de alcance de P5

- Login/OAuth, roles admin, “solo el autor borra”. El dueño borra en Supabase.  
- PIN `VITE_LIBRARY_PIN`.  
- Editor colaborativo del tap-sync.  
- Re-sincronizar / editar una canción ya subida.  
- Detectar estribillos repetidos por texto.  
- Reescribir `planRelay`.  
- Servidor `apps/server` / modo offline.  
- Migración automática IndexedDB → nube.  
- Subir MP3 al repo git.  
- E2E Playwright.  
- Reconexión de host si cierra la pestaña.

---

#### Criterios de aceptación

1. No hay botón de borrar en Home ni Lobby. Un cliente con la anon key **no** puede `DELETE` (política RLS). El dueño sí borra en el dashboard.  
2. Subir canciones sigue funcionando (INSERT + Storage).  
3. Wizard exige género de la lista cerrada; la canción nueva aparece filtrable por ese género.  
4. Host desmarca el uploader del grupo B → esas canciones no salen en el sorteo. Host desmarca 2 temas sueltos → no salen. Pool vacío → no arranca.  
5. Partida de 3 rondas en relevo: 3 canciones del setlist, puntos se acumulan, al final hay un ganador. «Una más» añade una ronda. «Terminar show» cierra antes.  
6. Modo karaoke: letra nunca se apaga; host elige cantantes; al terminar, voto 1–5; los puntos de estrellas se suman al marcador. Individual/relay siguen con sí/no.  
7. Misma canción, 1ª y 2ª reproducción: la letra de los **móviles** sigue el audio de la TV (±~200 ms de red, no ~2 s). El host no publica `playing` antes de que el audio esté sonando.  
8. Intro/preroll: `getLyricWindow` sigue sin adelantar la primera línea. Tap-sync del wizard sin regresiones.  
9. Realtime (crear sala / unirse por código) no se rompe.  
10. `npm test`, `typecheck`, `lint`, `build:web` en verde.

---

#### Dónde vive el código (sugerido)

| Pieza | Dónde |
|-------|--------|
| RLS sin DELETE + columna `genre` | `supabase/schema.sql` |
| Quitar borrado cliente | `App.tsx`, `cloudSongStore.ts` |
| Playhead + startedAt tras `play()` | `engine.ts`, `useHostAudio.ts`, `App.tsx`, `game.ts` |
| Enum géneros | `packages/shared` (exportar labels) |
| Wizard género | `UploadSongWizard.tsx`, `userSong.ts` |
| Setlist puro + tests | p. ej. `apps/web/src/songs/setlist.ts` |
| Lobby setlist + rondas | `App.tsx` Lobby |
| `totalRounds` en config + «Una más» | `model.ts`, `engine.ts`, Score/Finished |
| Modo karaoke + estrellas | `model.ts`, `engine.ts`, Voting/Score/Lobby |

---

### Restricciones

- No romper Realtime ni GitHub Pages (`VITE_BASE_PATH` / `BASE_URL`).  
- No reescribir el planner de relevo/sorpresa.  
- No añadir dependencias pesadas (cliente Supabase ya está).  
- No commitear `.env` ni MP3.  
- Copyright: subidas = responsabilidad del grupo, uso privado de fiesta.  
- No reintroducir borrado en la app “por si acaso”.  
- No uses la calibración ±0.5 s como arreglo del delay de 2 s.

### Verificación

```powershell
npm test
npm run typecheck
npm run lint
npm run build:web
npm run dev
```

Checklist manual:

1. Humano: re-pegar SQL (sin DELETE; columna genre).  
2. Home/Lobby: no hay papelera. Subir una canción nueva **con género** sigue funcionando.  
3. Intentar borrar por API con la anon key debe fallar (PostgREST 401/403).  
4. Lobby: filtrar un género, quitar un uploader, desmarcar una canción; Empezar; el sorteo respeta el pool.  
5. 3 rondas + «Una más» + «Terminar show»; puntos acumulados en el podio.  
6. Karaoke: elegir 2 cantantes; letra visible; voto de estrellas; el no elegido vota.  
7. Misma canción dos veces: móviles alineados con la TV (no ~2 s). Calibrar ±0.1 s mueve host y móviles.  
8. Un móvil se une por código (regresión Realtime).  
9. Relevo e individual siguen jugables (apagón + sí/no).

---

## Notas para el humano (dueño del repo)

0. **P5 ya está en `main`.** Antes de la próxima fiesta, **vuelve a pegar** `supabase/schema.sql` completo en el SQL Editor: quita las políticas `DELETE` de `songs` y `storage.objects`, y añade la columna `genre` (`add column if not exists genre text not null default 'otro'`, ya incluida en el script). Es seguro volver a correrlo aunque ya lo hayas corrido antes.  
1. `apps/web/.env` y secrets de Actions (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) no cambian.  
2. CORS de Storage: Pages (`https://orusuko.github.io` o el origin real) + `http://localhost:5173`.  
3. **Borrar canciones:** Table Editor (`songs`) + Storage (`song-audio`), borrando la fila y el objeto con el mismo `id`. Ya no se puede desde la app ni con la anon key (RLS lo bloquea tras volver a pegar el SQL).  
4. Canciones subidas antes de P5 quedan con género `'otro'` (default de la columna nueva) aunque el JSONB tenga `"custom"`; en el setlist salen como «Otro». No se migran a ciegas: re-súbelas o edita el JSONB a mano si quieres reclasificarlas.  
5. Plan gratis ~1 GB Storage; 12 MB/canción.  
6. Fiesta: host en Pages o localhost; móviles con internet y el código. El host necesita firmar/leer Storage.  
7. Autoplay: si el navegador bloquea, nudge «Reproducir audio» durante el countdown (pantalla se queda en "YA" hasta que el audio arranca de verdad); P5 marca `startedAt` **después** de ese `play()`, no antes — así se corrigió el delay de ~2 s reportado.  
8. Decisión documentada (punto 1 del plan): se dejó `UPDATE` abierto para `anon` en `songs` y `storage.objects` porque `saveCloudSong` usa `upsert` (permite re-subir el MP3 de una canción ya importada sin fallar por conflicto de `id`). Si en el futuro prefieres cerrarlo también, cambia el guardado a `insert` puro.  
9. **Setlist:** es por sala, no se guarda en Supabase; cada host la arma de nuevo al abrir el lobby (género + quién subió + exclusión de temas sueltos), sobre la biblioteca completa del grupo.  
10. **Rondas:** el stepper del lobby por defecto llega en **5**; se puede bajar a 1 o subir hasta 12. Al llegar a la última, «Una más» suma una ronda más; «Terminar show» cierra en cualquier momento.  
11. **Karaoke:** un turno = la canción completa para un cantante (no se parte por estrofas); los puntos de la ronda son la **suma** de las estrellas (1–5) que dé cada votante no-cantante, no un promedio.  
12. Si algún día vuelve a sentirse desfasado en fiesta real, revisa primero que el host esté reportando el playhead (consola: sin errores de `reportPlayhead`) antes de tocar la calibración manual — la calibración ±0.1/0.5 s es solo ajuste fino, no el arreglo del delay de arranque.
