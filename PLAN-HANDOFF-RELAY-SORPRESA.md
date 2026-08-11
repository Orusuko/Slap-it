# Plan / Prompt de handoff — Slay It

> Documento listo para pegar a otra IA (p. ej. Claude).  
> **Estado del motor / fiesta:** P0 + P1 + P3 (wizard «Sube tu canción») hechos.  
> **Siguiente entrega principal:** ninguna abierta; queda backlog opcional (ver «ENTREGA SECUNDARIA» y «Backlog P2»).

---

## Cómo usar este archivo

Copia desde **«PROMPT PARA LA IA»** hasta el final de esa sección.  
El dueño del producto ya acordó el flujo UX descrito abajo; implementarlo de punta a punta en el repo existente.

---

## PROMPT PARA LA IA

### Rol

Ingeniero senior full-stack sobre **Slay It** (repo monorepo existente).  
No reescribas la arquitectura: **host autoritativo + Supabase Realtime (Broadcast/Presence) + deploy GitHub Pages**.  
UI en **español**. Sin APIs Spotify/Apple Music para play/pause/seek.  
Respeta el estilo del código existente; cambios enfocados; tests en verde.

### Contexto del producto

- Karaoke de fiesta: TV/PC = anfitrión (audio + control); móviles = jugadores (letra + votos).  
- Catálogo actual: demos + placeholders + 1 canción real (`pedro-fernandez-yo-el-aventurero`) con timings **aproximados uniformes**.  
- Audio del host: `useHostAudio` (probe de catálogo, adjunto manual, nudge de autoplay).  
- Sync de partida: reloj `hostNow` + offset en clientes + calibración ±0.5 s en karaoke.  
- Multijugador: canal Realtime por código de sala; join solo tras `whenReady()` (SUBSCRIBED + track).

### Completado (no reimplementar)

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
| `endReason`, pool sin PLACEHOLDER | Hecho |
| Presence con gracia (~12 s) + rejoin | Hecho |
| Join solo tras SUBSCRIBED + track (`whenReady`) | Hecho |
| Empezar show aplica draft de config | Hecho |
| `hostHasAudio` en estado público | Hecho |
| `probing` bloquea 3-2-1 | Hecho |
| Selector de canción en lobby | Hecho |
| `hostNow` + offset de reloj en clientes | Hecho |
| Leave del cantante en individual → score | Hecho |
| Voto exige Presence key visible | Hecho (parcial) |
| Canal Realtime no se cierra por deps de `hostAudio` | Hecho |
| IDs con `createRandomId` (funciona en HTTP por IP local, no solo localhost) | Hecho |
| ~~Canción real Pedro Fernández (letra 1ª pasada + MP3)~~ | **Retirada** — ver nota abajo |
| **Wizard «Sube tu canción» (P3): audio + letra + tap-sync + IndexedDB** | **Hecho** |
| Selector de canción en lobby incluye «Mis canciones» + exportar/importar JSON | Hecho |
| `RoomManager.registerSongs` (canciones subidas elegibles fuera de `demoSongs`) | Hecho |
| Letra del host anclada a `audio.currentTime` (no solo reloj de pared) | Hecho |
| Calibración fina ±0.1 s además de ±0.5 s | Hecho |

Archivos clave: `apps/web/src/App.tsx`, `apps/web/src/realtime/*`, `apps/web/src/audio/useHostAudio.ts`, `apps/web/src/game/hostEngine.ts`, `apps/web/src/songs/*`, `packages/shared/src/{engine,model,catalog,songs}/*`.

### Cómo quedó implementado el wizard «Sube tu canción» (P3)

Para referencia si hay que tocarlo o extenderlo:

- **Esquema**: `packages/shared/src/model.ts` — `audioSource` ahora es una unión `{ type: "local", path } | { type: "user" }`. Backward-compatible; canciones del catálogo sin cambios.
- **Persistencia**: `apps/web/src/songs/userSongStore.ts` — IndexedDB (`slay-it-songs`) con dos object stores: `songs` (metadata + letra + timings) y `audio` (blob del MP3, keyed por `song.id`). Import sin audio guarda `hasAudio: false`; el host puede adjuntar el MP3 manualmente en Ready (flujo `attach` ya existente).
- **Parse de letra**: `apps/web/src/songs/parseLyrics.ts` (+ test) — una línea de texto = una línea de karaoke; quita timestamps LRC opcionales al inicio.
- **Motor de tap-sync**: `apps/web/src/songs/tapSync.ts` (+ test) — funciones puras (`beginTapSync`, `tapNext`, `finishTapSync`, `undoTapSync`, `restartTapSync`, `buildLinesFromTapSync`) sobre un estado inmutable `TapSyncState`.
- **Ensamblado de `Song`**: `apps/web/src/songs/userSong.ts` — una sola sección `verse` con todas las líneas; `audioSource: { type: "user" }`.
- **Export/Import**: `apps/web/src/songs/songExport.ts` (+ test) — exporta JSON (letra + timings + meta, **sin** el MP3); importar valida con `songSchema.safeParse` y guarda con `audioBlob: null` (el host adjunta el MP3 si lo tiene).
- **UI**: `apps/web/src/songs/UploadSongWizard.tsx` — modal de 3 pasos (meta+audio → letra → tap-sync), reutiliza clases `.button`/`.field` existentes; estilos nuevos en `styles.css` (`.modal-overlay`, `.wizard-*`, `.tap-*`, `.song-pick-tools`, `.upload-entry`).
- **Integración**: `App.tsx` — botón «Sube tu canción» en `Home`; estado `userSongs`/`showUpload`; `Lobby` añade optgroup «Mis canciones» + botones Exportar/Eliminar/Importar JSON.
- **Motor de partida**: `packages/shared/src/engine.ts` añade `RoomManager.registerSongs(songs)` y `findSong(id)` (catálogo ∪ canciones externas) — sin esto, `selectSongChoice`/`prepareRound` solo conocían `demoSongs` y una canción subida nunca podría jugarse. `apps/web/src/game/hostEngine.ts` expone `registerSongs`; `App.tsx` lo llama al crear la sala y cada vez que se sube/importa una canción nueva.
- **Reproducción**: `useHostAudio.loadCatalog` detecta `audioSource.type === "user"`, resuelve el blob vía `getUserSongAudioBlob(song.id)` y crea un Object URL (mismo patrón que el adjunto manual).

### Catálogo reseteado a cero (a petición del dueño, para probar limpio)

Se retiraron **todas** las canciones de prueba para validar el wizard sin ruido:

- `packages/shared/src/catalog.ts` → `demoSongs: Song[] = []` (se borraron los 20 demos sintéticos, los 3 `placeholderSongs` y `realSongs`/`yo-el-aventurero`).
- Se eliminó `packages/shared/src/songs/yo-el-aventurero.ts` y `apps/web/public/audio/pedro-fernandez-yo-el-aventurero.mp3`.
- **Importante**: `RoomManager.start()` necesita al menos una canción (catálogo ∪ `registerSongs`) o lanza `"No hay canciones disponibles"`. Con el catálogo vacío, la única forma de jugar es subir una canción con el wizard (o añadir una entrada real en `catalog.ts`).
- Los tests del motor (`engine.test.ts`, `relay.test.ts`, `game.test.ts`, `flow.integration.test.ts`) ya no dependen de `demoSongs`: usan `packages/shared/src/testFixtures.ts` (`createFixtureSong`/`createFixturePlaceholder`, no exportado en el `index.ts` público) + `RoomManager.registerSongs(...)` para tener canciones fixture con suficientes secciones para relevo/blackout. `apps/web/src/game/hostEngine.test.ts` hace lo mismo con un `Song` fixture inline (no puede importar `testFixtures.ts` al cruzar de paquete).
- `prepareRound` (fallback "Al azar") ahora sortea sobre `[...demoSongs, ...externalSongs]`, no solo `demoSongs` — así el azar funciona también cuando el único contenido disponible son canciones subidas.
- `Home`/`Lobby` no requieren cambios adicionales: el selector ya oculta el optgroup «Catálogo» si `partySongs` está vacío, y muestra «Mis canciones» en cuanto subas la primera.

---

### ENTREGA PRINCIPAL — Wizard «Sube tu canción» (P3) — ✅ HECHA

Objetivo (cumplido): que el anfitrión (y amigos en el PC del host) puedan **cargar MP3 + letra + sincronizar por taps**, guardar la canción y **elegirla en el lobby** para jugar ya sincronizada.  
Esto sustituye (para canciones nuevas) el editado manual de timestamps y aprovecha trabajo colaborativo.

> El detalle de dónde vive cada pieza está arriba, en «Cómo quedó implementado el wizard». Lo que sigue es la especificación original (útil como referencia/contrato, ya no como TODO).

#### UX acordada (3 modales / pasos desde Home)

En la pantalla de inicio (`Home`), añadir entrada clara: **«Sube tu canción»** (no debe romper el hero ni competir con Crear sala / Entrar).

**Paso 1 — Meta + audio**

- Cargar archivo de audio (`accept="audio/*"`).  
- Campos: **Título**, **Artista**.  
- Botón **Continuar** (disabled si falta archivo, título o artista).  
- Al continuar: leer `duration` del audio (`HTMLAudioElement` / metadata).

**Paso 2 — Letra**

- Editor de texto amplio: escribir, pegar y editar.  
- Convención: **una línea del editor = una línea de karaoke** (split por `\n`, trim, ignorar vacías).  
- Mostrar contador de líneas.  
- Botón **Continuar** (disabled si &lt; 1 línea útil).  
- Opcional útil: al pegar, strip suave de timestamps tipo `[00:12.00]` o `00:12` al inicio de línea si aparecen.

**Paso 3 — Sync por taps (el corazón)**

- Reproducir el audio cargado.  
- Mostrar letra: **línea actual grande** + siguiente tenue (y opcionalmente la anterior).  
- Botón grande centrado abajo: al pulsarlo marca el fin de la línea actual / inicio de la siguiente con `audio.currentTime`.  
- Definición de timing acordada:
  1. Al pulsar **Empezar sync** (o el primer tap): marca `start` de la línea 0 = `currentTime` (o 0 si el usuario elige «desde el inicio»).  
  2. Cada tap **«Siguiente»**: `end` de la línea actual = `currentTime`; `start` de la siguiente = mismo instante (o +ε mínimo).  
  3. Última línea: al acabar el audio o al pulsar «Terminar», `end` = `min(duration, currentTime)` (o duration).  
- Controles mínimos: play/pause, **Deshacer último tap**, reiniciar sync, **Guardar**.  
- Validar que `start < end` y que no se salten índices.

**Post-guardado**

- Persistir canción en el **dispositivo del host** (IndexedDB recomendado; `localStorage` solo si el audio cabe — preferir IDB para blob MP3 + JSON de metadata/líneas).  
- Aparecer en el **selector de canción del lobby** del host junto al catálogo demo (sección «Mis canciones» / «Subidas»).  
- Botones: **Exportar JSON** (letra + timings + meta; sin obligar a embeber el MP3 si es enorme) e **Importar JSON** (para pasar canciones entre PCs o meterlas luego al repo).  
- Al elegir una canción subida en partida: el host debe poder reproducirla vía blob URL / Object URL (igual que `attach` actual), y marcar `hostHasAudio` como hoy.

#### Modelo de datos

Reutilizar / extender `Song` de `@slay-it/shared` (`songSchema`):

- `id`: estable (p. ej. `custom-<uuid>`).  
- `title`, `artist`, `duration`.  
- `lines[]` con `start`/`end`/`text`/`sectionId`.  
- **MVP de secciones:** una sola sección `verse` (o `custom`) que englobe todas las líneas — suficiente para relevo básico.  
- `genre` / `difficulty` / `chorusStart`: defaults sensatos (`genre: "custom"`, `difficulty: "medium"`, `chorusStart: lines[0].start` o ~1/3 de duration).  
- `audioSource`: para subidas locales **no** uses solo `path` de `public/`; guarda el blob en IDB y en runtime resuelve URL. El schema actual tiene `audioSource?: { type: "local", path }` — opciones aceptables:
  - A) Extender el schema con algo como `{ type: "user", id: string }` / opcional, **o**
  - B) Mantener el `Song` sin path y asociar `songId → blob` solo en la capa web.

Preferencia: **extender el schema de forma backward-compatible** si hace falta; no romper canciones del catálogo.

#### Dónde vive el código (sugerido)

| Pieza | Ubicación sugerida |
|-------|--------------------|
| UI wizard (3 pasos) | `apps/web/src/songs/UploadSongWizard.tsx` (o similar) |
| Persistencia IDB | `apps/web/src/songs/userSongStore.ts` |
| Parse letra → líneas | `apps/web/src/songs/parseLyrics.ts` (+ test) |
| Tap sync engine puro | `apps/web/src/songs/tapSync.ts` (+ test) — funciones puras fáciles de testear |
| Hook audio del editor | reutilizar patrones de `useHostAudio` o un hook ligero solo para el wizard |
| Integración Home + Lobby | `App.tsx` |
| Tipos compartidos | `packages/shared` solo si el schema cambia |

#### Criterios de aceptación

1. Desde Home se abre el wizard «Sube tu canción».  
2. Se puede completar los 3 pasos y **Guardar**.  
3. Tras recargar la página del host, la canción **sigue** en «Mis canciones».  
4. En lobby, el host puede seleccionarla; al empezar el show, suena el audio y la letra avanza según los taps.  
5. Exportar / importar JSON redondea el flujo entre dispositivos (al menos metadata + timings; documentar si el MP3 va aparte).  
6. `npm test`, `typecheck`, `lint`, `build:web` en verde.  
7. UI en español, usable en desktop (el sync se hace en el PC del host; no es obligatorio mobile-first en el wizard).  
8. No romper Crear sala / Entrar / Realtime.

#### Fuera de alcance de este P3 (no hacer ahora)

- Subir canciones a Supabase Storage / biblioteca cloud compartida entre amigos en la nube.  
- Editor colaborativo multi-dispositivo en tiempo real del sync.  
- APIs de letras comerciales.  
- Reescribir el planner de relevo.  
- Pulir a mano *Yo el aventurero* (puede hacerse luego importando/exportando o con el mismo wizard si se permite «re-sincronizar»).

---

### ENTREGA SECUNDARIA (si sobra tiempo en el mismo handoff)

1. ~~Anclar letra al `audio.currentTime` del host durante `phase === "playing"` cuando hay audio interno~~ — ✅ Hecho (`Karaoke` en `App.tsx` usa `hostAudio.getCurrentTime()` cuando `role === "host"`; los jugadores siguen usando `hostNow` + offset).  
2. ~~Calibración fina opcional (±0.1 s) además de ±0.5 s~~ — ✅ Hecho (botones extra en `.calibration`).  
3. **Pendiente** — Completar letra de `yo-el-aventurero` si el dueño aporta texto faltante (archivo: `packages/shared/src/songs/yo-el-aventurero.ts`). No se puede completar sin que el dueño pegue la letra real; mientras tanto puede recrearse con el wizard «Sube tu canción» (subir el MP3 + pegar/tapear la letra real) como alternativa ya funcional.

---

### Backlog P2 / posterior (no bloquea P3)

- E2E Playwright; CI con secrets Supabase.  
- Reconexión de host si cierra la pestaña.  
- Recablear `apps/server` offline.  
- Autorización Realtime más estricta en dashboard Supabase.  
- Spoof total de `playerId` en join.  
- Biblioteca cloud (Storage) cuando el flujo local+export se quede corto.

### Restricciones

- No romper Realtime ni GitHub Pages (`BASE_URL`).  
- No reescribir el planner de relevo/sorpresa.  
- No añadir dependencias pesadas sin necesidad (IDB nativo o wrapper mínimo).  
- Mantener tests en verde; añadir unit tests para parse de letra y lógica de taps.  
- Copyright: las subidas son responsabilidad del usuario (uso privado de fiesta); no subir MP3 ajenos al repo.

### Verificación

```powershell
npm test
npm run typecheck
npm run lint
npm run build:web
npm run dev
```

Checklist manual (verificado con `npm test` / `typecheck` / `lint` / `build:web` en verde; falta probar a mano en navegador real):

1. Home → Sube tu canción → 3 pasos → Guardar.  
2. Recargar → sigue en Mis canciones.  
3. Crear sala → seleccionar canción subida → ready → 3-2-1 → suena y la letra sigue los taps.  
4. Exportar JSON → borrar canción → Importar → vuelve a aparecer.  
5. Un móvil en la misma Wi‑Fi sigue pudiendo unirse por código (regresión Realtime).

---

## Notas para el humano (dueño del repo)

0. **El catálogo empieza vacío.** Antes de crear una sala para probar, sube al menos una canción con «Sube tu canción» desde el inicio (o añade una entrada real en `catalog.ts`); si intentas «Empezar show» sin ninguna canción disponible, el host verá el error «No hay canciones disponibles».  
1. `apps/web/.env` con `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.  
2. Fiesta local: host en `http://localhost:5173`; móviles en `http://<IP-LAN>:5173` (IDs ya no dependen de `crypto.randomUUID` en contexto inseguro).  
3. Host debe ver **En vivo** antes de que entren jugadores.  
4. Autoplay: si el navegador bloquea audio, usar el nudge «Reproducir audio» en karaoke.  
5. Canciones subidas viven en **ese navegador/dispositivo** (IndexedDB) hasta que las exportéis (botón «Exportar» junto al selector de canción, en el lobby) o montéis Storage en la nube.  
6. Para pasar una canción subida a otro dispositivo/host: exportar el JSON, pasarlo (Drive, WhatsApp, USB…), e «Importar JSON» en el otro navegador. El JSON no lleva el MP3 (puede pesar mucho); si falta, adjúntalo a mano en la pantalla «Ready» como ya se hacía antes.  
7. El wizard se sincroniza a mano tocando un botón por verso mientras suena el MP3; entre más amigos ayuden a sincronizar canciones distintas, más rápido crece la biblioteca local del host.
