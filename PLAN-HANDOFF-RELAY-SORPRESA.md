# Plan / Prompt de handoff — Slay It

> Documento listo para pegar a otra IA (p. ej. Claude Opus).  
> **Estado del motor / fiesta:** P0 + P1 + P3 (wizard local) hechos.  
> **Siguiente entrega principal: P4 — biblioteca cloud colaborativa en Supabase + marcado de estribillo.**

---

## Cómo usar este archivo

Copia desde **«PROMPT PARA LA IA»** hasta el final de esa sección.  
Implementar de punta a punta en el repo existente. No reescribir la arquitectura de partida.

---

## PROMPT PARA LA IA

### Rol

Ingeniero senior full-stack sobre **Slay It** (repo monorepo existente).  
No reescribas la arquitectura de juego: **host autoritativo + Supabase Realtime (Broadcast/Presence) + deploy GitHub Pages**.  
**Sí** debes pasar a usar **Postgres + Storage** del mismo proyecto Supabase para la biblioteca de canciones.  
UI en **español**. Sin APIs Spotify/Apple Music para play/pause/seek.  
Respeta el estilo del código existente; cambios enfocados; tests en verde.

### Contexto del producto

- Karaoke de fiesta: TV/PC = anfitrión (audio + control); móviles = jugadores (letra + votos).  
- El catálogo estático (`demoSongs`) está **vacío**. Las canciones reales salen del wizard «Sube tu canción».  
- Hoy esas canciones viven en **IndexedDB del navegador del host**. Eso no sirve: si preparas canciones en casa, en la fiesta (otro PC) no están.  
- El enfoque es **trabajo colaborativo entre amigos**: cualquiera del grupo debe poder subir, listar y usar canciones desde **cualquier dispositivo** con internet.  
- Multijugador: canal Realtime por código de sala (esto no cambia).  
- GitHub Pages ya inyecta `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el build (secrets de Actions).

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
| Wizard «Sube tu canción»: audio + letra + tap-sync | Hecho (persistencia **local**; hay que moverla a la nube) |
| `RoomManager.registerSongs` + selector lobby | Hecho |
| Letra del host anclada a `audio.currentTime` vía `getLyricWindow` | Hecho — **no adelantar** la próxima línea en intro/preroll |
| Calibración ±0.1 s y ±0.5 s | Hecho |
| Tap-sync UX: autoplay al entrar, **Empezar** solo marca, **Siguiente línea**, contador `Línea X/N`, **Probar letra** | Hecho — **no volver** a `play()` + `beginTapSync` en t=0 |
| Lista «Mis canciones» + borrar en Home (hoy lee IndexedDB) | Hecho a nivel UI; hay que apuntarla a Supabase |

Archivos clave: `apps/web/src/App.tsx`, `apps/web/src/realtime/*`, `apps/web/src/audio/useHostAudio.ts`, `apps/web/src/game/hostEngine.ts`, `apps/web/src/songs/*` (`UploadSongWizard.tsx`, `tapSync.ts`, `userSong.ts`, `userSongStore.ts`, `parseLyrics.ts`), `packages/shared/src/{engine,model,catalog,game,relay}.ts`.

### Cómo está el wizard hoy (extender, no tirar)

- **Esquema** (`packages/shared/src/model.ts`): `audioSource` = `{ type: "local", path } | { type: "user" }`. Habrá que añadir un tercer tipo cloud.  
- **Persistencia actual**: `userSongStore.ts` → IndexedDB `slay-it-songs` (`songs` + `audio`). Deja de ser fuente de verdad.  
- **Parse letra**: `parseLyrics.ts` — una línea de texto = una línea de karaoke.  
- **Tap-sync**: `tapSync.ts` — `begin` = start de la línea 0; cada tap cierra la actual y abre la siguiente en el mismo `currentTime`.  
- **Ensamblado**: `assembleUserSong` crea **una sola sección `verse`** y pone `chorusStart` en el start de la primera línea. Eso rompe el espíritu del relevo/apagón (todo el tema es una estrofa). P4 debe partir las secciones de verdad.  
- **UI**: modal 3 pasos (meta → letra → sync). Home tiene «Sube tu canción» y lista local.  
- **Motor**: `registerSongs` ya permite jugar canciones que no están en `demoSongs`.  
- **Repro**: `useHostAudio.loadCatalog` resuelve `type: "user"` con blob IDB. Debe resolver también URL de Storage.

### Por qué el estribillo importa (no es cosmética)

`planRelay` reparte **`song.sections`** (1–4 por turno). `selectBlackout` / `selectStartPosition` buscan cerca de **`chorusStart`**.  
Con una sola sección `verse`, el relevo no tiene estrofas reales y el apagón no cae en el estribillo. Al marcar estribillo hay que **construir varias secciones** (`verse` / `chorus`) y fijar `chorusStart` al inicio del primer bloque chorus.

---

### ENTREGA PRINCIPAL — P4: Biblioteca cloud colaborativa + estribillo

Objetivo: que **tú y tus amigos** suban canciones desde cualquier PC, y que **cualquier host** (en casa o en la fiesta) vea el mismo catálogo, con audio y letra sincronizada, **sin pasar JSON ni MP3 a mano**.

#### 1. Modelo en Supabase (humano aplica SQL; tú dejas el archivo en el repo)

Añade `supabase/schema.sql` (o `supabase/migrations/001_songs_library.sql`) **listo para pegar** en el SQL Editor del dashboard. Incluye políticas RLS. No asumas que hay CLI de Supabase instalada.

**Tabla `songs`** (nombres exactos a tu criterio, pero documenta):

| Columna | Uso |
|---------|-----|
| `id` | PK, el mismo `Song.id` (`custom-…`) |
| `title`, `artist`, `duration` | para listar sin parsear JSON |
| `uploaded_by` | apodo de quien subió (colaborativo, visible en UI) |
| `song` | JSONB con el `Song` completo (líneas, secciones, `chorusStart`, `audioSource`) |
| `created_at` | timestamptz default `now()` |

Índice útil: `(lower(title), lower(artist))` para avisar duplicados.

**Bucket Storage `song-audio`:**

- Un objeto por canción: `{id}` (o `{id}.mp3`).  
- Límite de subida en la app: **12 MB**. Aceptar `audio/*` (mp3, m4a, wav, ogg).  
- Bucket **privado** (sin listado público). Reproducción con **URL firmada** (`createSignedUrl`, ~1 h) al cargar la canción en el host.  
- Políticas Storage: `anon` puede `SELECT`, `INSERT`, `DELETE` (y `UPDATE` si hace falta overwrite) **solo** en ese bucket.

**RLS tabla `songs` (colaborativo, sin login):**

- `SELECT` para `anon` y `authenticated`.  
- `INSERT` / `UPDATE` / `DELETE` para `anon` y `authenticated`.  

Esto es deliberado: el grupo de amigos comparte la URL de GitHub Pages y el proyecto Supabase. **No** pongas Auth obligatorio (fricción). **Sí** documenta el riesgo: quien tenga la URL de la app + la anon key del bundle puede escribir. Mitigaciones mínimas en la app (abajo). No inventes un backend aparte.

Habilitar **Realtime no es necesario** para la tabla; el listado se refresca al abrir Home/Lobby y tras Guardar.

#### 2. Identidad ligera (colaborativa, sin cuentas)

- En el wizard, campo obligatorio **«Tu nombre»** / «Quién sube» (`uploaded_by`, max ~24). Guardarlo en `localStorage` para no pedirlo cada vez.  
- Listados: mostrar `título — artista · subida por X`.  
- **No** uses login de Supabase Auth en P4.  
- Antes de borrar: confirmación con el título (`window.confirm` o modal corto). Cualquier amigo puede borrar (catálogo compartido); no hace falta “solo el autor”.  
- Si ya existe una canción con el mismo título+artista (case-insensitive), avisar y pedir confirmación para subir otra o cancelar.

Opcional barato (si queda limpio): `VITE_LIBRARY_PIN` — un PIN compartido entre amigos, comprobado **solo en el cliente** antes de insert/delete. No es seguridad real (va en el bundle); es un pestillo contra visitas aleatorias. Si lo añades, documenta el secret extra en GitHub Actions y `.env.example`. Si complica de más, omítelo.

#### 3. Capa de datos en la app

Nueva pieza (p. ej. `apps/web/src/songs/cloudSongStore.ts`) usando `getSupabaseClient()`:

- `listCloudSongs()` → filas ordenadas por `created_at` desc.  
- `saveCloudSong(song, audioFile, uploadedBy)` → upload Storage + upsert fila. Si falla el SQL tras el audio, intenta borrar el objeto huérfano.  
- `deleteCloudSong(id)` → borra fila + objeto.  
- `getCloudAudioUrl(id)` → signed URL.

Extiende `audioSource`:

```ts
{ type: "local", path: string } | { type: "user" } | { type: "supabase", objectKey: string }
```

Las canciones nuevas usan `type: "supabase"`. `type: "user"` puede seguir existiendo por JSON viejos; si no hay blob IDB, el host adjunta audio en Ready como hoy.

`useHostAudio.loadCatalog`: si `type === "supabase"`, firmar URL y asignarla al `<audio>` (mismo probe/autoplay que catálogo local).

Al arrancar y al guardar: `listCloudSongs` → `registerSongs` en el host. Home y Lobby leen **la nube**, no IndexedDB.

IndexedDB: **deja de ser la biblioteca**. Puedes dejar el módulo como caché opcional o no usarlo para listar. No migres automáticamente canciones viejas de IDB a la nube (el dueño las volverá a subir con estribillo). Sí puedes mostrar un aviso si detectas IDB residual: “Las canciones de este navegador ya no se usan; súbelas de nuevo a la biblioteca compartida”.

Exportar/importar JSON: **mantener** como respaldo (sin MP3). Importar debe **subir a Supabase** (pedirá el audio otra vez si no está). No dejes el import solo en IDB.

#### 4. Wizard: marcar el estribillo

Ampliar el **paso Letra** (no hace falta un 4º modal si cabe; si se satura, un paso «Estribillo» entre letra y sync).

Tras parsear líneas:

1. Lista numerada de líneas.  
2. El usuario marca **uno o más bloques contiguos** como estribillo (el estribillo suele repetirse). UX sugerida: pulsar «Marcar estribillo», elegir línea inicio y línea fin; botón «Añadir otro estribillo» para el segundo/tercer estribillo. Alternativa aceptable: toggle por línea (`verso` / `estribillo`) con fusión posterior de runs contiguos.  
3. **Al menos un bloque chorus** para Continuar (si no, el apagón no tiene ancla). Copy claro: “Marca qué líneas son el estribillo (puedes marcar varias veces si se repite)”.  
4. Las demás líneas quedan como `verse`. No hace falta intro/puente/outro en P4.

**Después del tap-sync**, `assembleUserSong` debe:

- Recibir las líneas ya temporizadas **y** las etiquetas por índice.  
- Agrupar runs contiguos del mismo tipo en `SongSection` (`verse` | `chorus`) con `start`/`end` de la primera/última línea del run y `lineIds`.  
- Poner `line.sectionId` coherente (el `songSchema` lo exige).  
- `chorusStart` = `start` de la **primera** sección `chorus`.  
- Varias secciones (típico: verse, chorus, verse, chorus…). El relevo necesita **más de una** sección; con 1 sola el plan se degrada.

Tests unitarios de este ensamblado (líneas + rangos chorus → secciones + `chorusStart`). No toques `planRelay` salvo bug evidente.

#### 5. UX de listados (Home + Lobby)

- Home: lista cloud (título, artista, quién subió) + borrar con confirmación + «Sube tu canción». «Borrar todas» **no** debe existir en la nube (demasiado destructivo para un catálogo compartido); quítalo o cámbialo a borrar **una**.  
- Lobby: optgroup «Biblioteca» (o «Canciones del grupo») con las cloud; el azar debe incluirlas (`registerSongs` + fallback ya existente).  
- Estados: cargando, error de red, vacío (“Aún no hay canciones. Sube la primera.”).  
- Progreso de subida del MP3 (porcentaje o “Subiendo audio…”).  
- El wizard sigue usable en desktop; no es obligatorio mobile-first, pero no lo rompas en pantalla estrecha.

#### 6. Tap-sync: no regresiones

Mantén el contrato actual:

- Al entrar a Sincronía, el audio **ya suena**. **Empezar no llama a `play()`**; solo marca el start de la línea 0.  
- Copy: pulsa Empezar cuando **empiece a cantarse** la primera línea; luego **Siguiente línea** cuando **termine** la grande.  
- Contador `Línea X / N`.  
- `setTapState(current => …)` funcional.  
- **Probar letra** usa `getLyricWindow` (current vacío en intro).  
- Karaoke en partida también usa `getLyricWindow`.

#### 7. Documentación para el humano

Actualiza `README.md` y las notas al final de este archivo:

1. SQL Editor: pegar `supabase/schema.sql`.  
2. Storage: crear bucket `song-audio` si el SQL no lo crea; confirmar políticas.  
3. Settings → API: ya tienen URL y anon key (local `.env` + secrets de Pages).  
4. CORS de Storage: origen de GitHub Pages (`https://orusuko.github.io`) y `http://localhost:5173`.  
5. Aviso de copyright: MP3s de uso privado entre amigos; no son públicos a propósito, pero las signed URLs existen.  
6. Plan gratis ≈ 1 GB Storage; 12 MB/canción.

#### Fuera de alcance de P4

- Login/OAuth, roles admin, moderación.  
- Editor colaborativo en tiempo real del tap-sync (dos personas tappeando a la vez).  
- APIs de letras comerciales.  
- Reescribir `planRelay`.  
- Servidor `apps/server` / modo offline.  
- Migración automática IndexedDB → nube.  
- Subir MP3 al repo git.

#### Criterios de aceptación

1. Amigo A sube una canción (con estribillo marcado) en su casa. Amigo B abre la app en otro dispositivo, la ve en Home/Lobby, crea sala, suena y la letra sigue los taps.  
2. Amigo B puede subir otra canción al **mismo** catálogo sin cuenta.  
3. Borrar una canción (con confirmación) la quita de la lista de todos al refrescar.  
4. El `Song` guardado tiene ≥1 sección `chorus`, ≥1 `verse` si hay letra fuera del estribillo, y `chorusStart` = inicio del primer chorus.  
5. Relevo/apagón usan esas secciones (no una sola sección que cubre toda la canción, salvo que el usuario marcara **todas** las líneas como estribillo).  
6. IndexedDB ya no es necesario para jugar.  
7. Realtime (crear sala / unirse por código) no se rompe.  
8. `npm test`, `typecheck`, `lint`, `build:web` en verde. Tests nuevos: ensamblado de secciones/chorus; store cloud mockeable si puedes sin flaky network.

#### Dónde vive el código (sugerido)

| Pieza | Dónde |
|-------|--------|
| SQL + políticas | `supabase/schema.sql` |
| Cliente biblioteca | `apps/web/src/songs/cloudSongStore.ts` |
| Estribillo (estado puro + tests) | `apps/web/src/songs/chorusRanges.ts` (o similar) |
| Ensamblado Song | `userSong.ts` (extender) |
| Wizard | `UploadSongWizard.tsx` (paso letra + save cloud) |
| Audio host | `useHostAudio.ts` |
| Listados | `App.tsx` Home/Lobby |
| Schema Song | `packages/shared/src/model.ts` (`audioSource` supabase) |

---

### ENTREGA SECUNDARIA (si sobra tiempo)

1. Re-sincronizar / editar una canción cloud ya subida (mismo id, overwrite audio opcional).  
2. Detectar estribillos repetidos por texto igual al primer bloque marcado (sugerir “¿Marcar también las líneas 24–27?”).  
3. PIN de biblioteca `VITE_LIBRARY_PIN` si no lo hiciste en el núcleo.

### Backlog posterior (no bloquea P4)

- Auth si el grupo deja de ser de confianza.  
- E2E Playwright.  
- Reconexión de host si cierra la pestaña.  
- Recablear `apps/server` offline.  
- Spoof de `playerId` en join.

### Restricciones

- No romper Realtime ni GitHub Pages (`VITE_BASE_PATH` / `BASE_URL`).  
- No reescribir el planner de relevo/sorpresa.  
- No añadir dependencias pesadas (cliente Supabase ya está).  
- No commitear `.env` ni MP3.  
- Copyright: subidas = responsabilidad del grupo, uso privado de fiesta.

### Verificación

```powershell
npm test
npm run typecheck
npm run lint
npm run build:web
npm run dev
```

Checklist manual:

1. Humano: aplicar SQL + bucket en el dashboard.  
2. PC A: Home → Sube tu canción → audio, nombre, letra, **marcar estribillo** (y repetición si aplica) → taps → Probar letra → Guardar (progreso de upload).  
3. PC B (otro navegador/red): recargar Home → aparece la canción de A, con “subida por …”.  
4. PC B: crear sala → elegirla → 3-2-1 → audio + letra alineados; intro no muestra la primera línea como actual.  
5. Modo relevo: hay varios turnos/secciones, no un único bloque.  
6. Borrar en B → en A al refrescar ya no está.  
7. Un móvil sigue uniéndose por código (regresión Realtime).  
8. Canción >12 MB: error claro, no se queda a medias.

---

## Notas para el humano (dueño del repo)

0. **P4 no funciona hasta que corras el SQL** en Supabase → SQL Editor y exista el bucket `song-audio` con las políticas del archivo del repo.  
1. `apps/web/.env` ya tiene `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Los mismos valores están (deben estar) en **Settings → Secrets → Actions** para Pages.  
2. En Storage, añade el origen de Pages y localhost a CORS si el audio no carga en la fiesta.  
3. Las canciones que ya subiste **solo en este Chrome** (IndexedDB) **no** pasarán solas a la nube. Tras P4, vuelve a subirlas marcando el estribillo.  
4. Cualquier amigo con la URL de la app puede subir o borrar: es el diseño colaborativo. Si algún día se abre al público, hará falta Auth.  
5. Plan gratis de Supabase: ~1 GB de audio; no subáis WAV enormes.  
6. Fiesta: host en Pages o `localhost`; móviles con internet y el código de sala. El host necesita poder firmar/leer Storage (misma anon key).  
7. Autoplay: si el navegador bloquea audio, nudge «Reproducir audio» en karaoke.
