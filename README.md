# Slay It

Juego de karaoke para 2–8 personas. Una pantalla (laptop o TV) funciona como
anfitrión y los teléfonos se conectan como controles mediante un código de
cuatro letras.

El MVP no reproduce ni controla Spotify, YouTube u otros servicios. La app
sincroniza un reloj y la letra mientras el anfitrión reproduce el audio
manualmente.

## Cómo funciona el multijugador (sin servidor propio)

La app está pensada para publicarse gratis en **GitHub Pages**, así que no hay
ningún servidor de por medio:

- El navegador del **anfitrión** ejecuta toda la lógica de la partida (sala,
  fases, apagón, marcador). Es la única fuente de verdad de la partida en
  curso; nada de eso se guarda en una base de datos.
- **Supabase Realtime** (plan gratuito) transporta mensajes entre el
  anfitrión y los teléfonos durante la partida.
- **Supabase Postgres + Storage** (mismo proyecto, plan gratuito) guarda la
  **biblioteca de canciones**: cada canción subida con el wizard queda
  disponible para todo el grupo, desde cualquier dispositivo, no solo en el
  navegador de quien la subió.
- Si el anfitrión cierra la pestaña, la sala se cierra. Si un jugador sale,
  su historial de esa partida se elimina. La biblioteca de canciones, en
  cambio, persiste entre partidas.
- Como el transporte es Supabase (internet), **ya no es obligatorio estar en
  la misma WiFi**: basta con que todos tengan conexión a internet y el mismo
  código de sala.

También se conserva un servidor local opcional (`apps/server`) con la misma
lógica de partida sobre Socket.IO, pensado para un futuro modo 100% sin
internet. La app publicada en GitHub Pages no lo usa ni depende de él.

## Requisitos

- Node.js 20 o posterior
- Una cuenta gratuita en [supabase.com](https://supabase.com) (Realtime para
  la partida + Postgres/Storage para la biblioteca de canciones)

## Configurar Supabase (una sola vez)

1. Crea un proyecto gratuito en supabase.com.
2. Ve a **Settings → API** y copia el **Project URL** y la **anon public
   key**. Los necesitarás en `apps/web/.env` (desarrollo) y como secrets de
   GitHub Actions (Pages).
3. Ve a **SQL Editor → New query**, pega el contenido completo de
   [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**. Esto crea:
   - La tabla `songs` (metadata + letra + timings de cada canción subida).
   - El bucket de Storage `song-audio` (privado, límite 12 MB por archivo)
     donde viven los MP3.
   - Las políticas de RLS que permiten a cualquiera con la anon key leer y
     subir canciones (modelo "biblioteca compartida entre amigos de
     confianza"; sin login). **Nadie puede borrar** desde la app, ni
     siquiera quien subió la canción: solo el dueño del proyecto, desde el
     dashboard de Supabase (ver «Moderar la biblioteca» más abajo).
4. Ve a **Storage → song-audio → Configuration → CORS** y añade los orígenes
   desde los que se usará la app: `http://localhost:5173` para desarrollo y
   tu URL de GitHub Pages (p. ej. `https://tu-usuario.github.io`) para
   producción. Sin esto, subir o reproducir audio desde el navegador falla
   con un error de CORS.

El script es seguro de volver a correr (usa `if not exists` / `on conflict`
en todo), así que si algo falla puedes pegarlo de nuevo sin duplicar nada.

### Sobre la biblioteca de canciones (importante)

- Es **colaborativa y sin login**: cualquiera con la URL de la app puede
  subir y listar canciones de la biblioteca del grupo. Es el diseño pensado
  para un grupo de amigos de confianza, no para uso público.
- **Nadie borra desde la app** (P5): ni quien subió la canción ni nadie más
  ve un botón de borrado. Es a propósito, para que una persona
  malintencionada no pueda vaciar la biblioteca del grupo. Solo el dueño del
  proyecto de Supabase puede borrar, y solo desde el dashboard.
- Los MP3 que suba cada quien son **responsabilidad de esa persona**: úsalo
  para uso privado entre amigos, no para redistribuir música con copyright
  a terceros. El bucket es privado (URLs firmadas, no indexable), pero no es
  una protección legal.
- El plan gratuito de Supabase incluye **~1 GB de Storage**: con el límite
  de 12 MB por canción alcanza para decenas de temas; evita subir WAV sin
  comprimir.

### Moderar la biblioteca (borrar una canción)

Solo el dueño del proyecto de Supabase puede borrar, desde el dashboard:

1. **Table Editor → `songs`**: busca la fila (por `title`/`artist`) y bórrala.
2. **Storage → `song-audio`**: borra el objeto cuya key coincide con el `id`
   de esa canción (mismo valor que la columna `id` de la fila anterior).

No hace falta hacer ambos pasos en un orden estricto, pero hazlos los dos:
borrar solo la fila deja un MP3 huérfano en Storage (cuenta contra tu cuota).

## Iniciar en desarrollo

```powershell
npm install
copy apps\web\.env.example apps\web\.env
# edita apps\web\.env con tu URL y anon key de Supabase
npm run dev
```

1. Abre `http://localhost:5173`, crea una sala y comparte el código.
2. Desde cualquier teléfono con internet, abre la misma URL (o la de
   GitHub Pages una vez publicada) y únete con el nombre y el código.

## Flujo de una ronda

1. El host configura la sala (opcionalmente elige canción) y pulsa
   **Empezar show** — eso aplica la config del formulario y arranca.
2. Ready muestra la canción. Si hay audio in-app (catálogo o adjunto), host y
   jugadores lo ven; si no, el host usa Spotify/YouTube al timestamp indicado.
3. Mientras se comprueba un MP3 del catálogo, el 3-2-1 espera. Luego el host
   inicia la cuenta; al llegar a "YA" con audio in-app, la sala se queda en
   countdown hasta que `audio.play()` **de verdad** resuelve — así la letra
   nunca arranca antes que el sonido real (fix del delay reportado en P5).
   Si el navegador bloquea el autoplay, el host ve un botón para reintentar.
4. Mientras suena, el host reporta su `audio.currentTime` real cada ~700 ms.
   Los jugadores derivan su posición de ese playhead (no de su propio reloj
   de pared), así siguen el altavoz real de la TV incluso si hay drift
   acumulado en canciones largas o en la segunda ronda de la noche. Si aun
   así se nota desfasado, el host puede recalibrar ±0.1/0.5 s a mano.
5. Apagón → reveal → voto / host → marcador (o votación de estrellas en
   modo karaoke).

### Modo relevo con sorpresa

Además del modo individual (cada jugador canta un fragmento y le toca su
propio apagón), el modo **relevo** reparte una sola canción completa entre
todo el grupo:

1. La canción empieza en un punto al azar (nunca cerca del final).
2. Los jugadores se van turnando en el orden en que entraron a la sala,
   cantando cada uno entre 1 y 4 estrofas seguidas.
3. Tras completar dos vueltas de todo el grupo (o menos, si la canción no da
   para tantas), a alguien le toca —siempre en el orden establecido, pero sin
   avisar de antemano— el turno sorpresa: se le apaga la letra durante 1 o 2
   estrofas y debe terminarlas de memoria.
4. La app nunca revela por adelantado quién tendrá la sorpresa: la pantalla
   solo muestra quién canta en el turno que está sonando en ese momento.
5. Termina igual que el modo individual: se revela la letra que faltaba y el
   grupo vota o el host decide si lo logró.

El reparto de turnos (`RelayPlan`) lo calcula `packages/shared/src/relay.ts` y
es puramente una función de la canción y de la lista de jugadores, así que es
el mismo tanto si la partida corre en `apps/server` como en el navegador del
host en GitHub Pages.

### Modo karaoke por turnos

Tercer modo (junto a relevo e individual): no hay minijuego de apagón, la
letra queda **siempre visible**. Pensado para simplemente cantar y que el
grupo puntúe la interpretación:

1. En el lobby, el host elige (opcional) qué jugador o jugadores cantarán
   esta noche; si no elige a nadie, cantan todos por turnos en el orden en
   que entraron a la sala.
2. Suena la canción con la letra siempre visible para todos; el host corta
   la interpretación con **«Terminar interpretación»** cuando termina.
3. El resto del grupo (menos quien cantó) vota de **1 a 5 estrellas**; la
   suma de estrellas son los puntos de esa ronda para quien cantó.

### Varias rondas por noche

El lobby tiene un selector de **rondas de la noche** (1–12, cualquier modo).
Los puntos se acumulan ronda a ronda y la canción de cada ronda se sortea de
nuevo dentro del setlist activo. Al llegar a la última ronda configurada, el
host puede:

- **Una más**: alarga el show una ronda extra (útil si al grupo se le
  antoja seguir).
- **Ver resultado final**: cierra el show y muestra el podio.

También puede **Terminar show** en cualquier ronda intermedia si hace falta
cortar antes de tiempo.

### Setlist de la noche (género, quién subió, exclusión)

Para que un grupo de amigos no herede canciones que no le gustan a otro
grupo, el lobby tiene un filtro de setlist sobre la **biblioteca del grupo**
(las canciones subidas con el wizard; el catálogo embebido del repo no pasa
por este filtro):

1. **Género** — chips para incluir/excluir géneros (banda, mariachi,
   ranchera, norteño, cumbia, pop, rock, balada, reggaetón, otro).
2. **Quién subió** — chips con el nombre de cada persona que haya subido
   algo; útil para tomar canciones solo de un subgrupo de amigos.
3. **Catálogo** — dentro de lo que dejan pasar género + uploader, se puede
   desmarcar canción por canción (p. ej. un tema que le gusta a alguien de
   otro grupo pero no al resto).

El resultado (género ∩ uploader − exclusiones) es el pool del que se sortea
cada ronda; también aparece primero en el selector de «Forzar canción». Si
queda vacío, **Empezar show** avisa y no arranca. La lógica vive en
`apps/web/src/songs/setlist.ts`.

### Audio en la app (catálogo o adjunto)

Hay dos formas de reproducir audio **solo en la pestaña del anfitrión**:

1. **Catálogo (`audioSource`)** — si la canción declara
   `audioSource: { type: "local", path: "/audio/mi-cancion.mp3" }` y el archivo
   **existe y carga** en `apps/web/public/audio/`, la app lo usa. Si el path
   apunta a un MP3 inexistente (p. ej. placeholders sin archivo), Ready
   **no** dice “Audio listo” y cae al fallback externo.
2. **Adjunto manual** — en "Pista preparada" el host puede elegir un MP3/M4A.
   Tiene prioridad sobre el del catálogo y no se sube a ningún servidor
   (`URL.createObjectURL`).

En ambos casos:

- Los teléfonos de los jugadores no reciben el audio.
- Se sincroniza con la letra (play al 0 del 3-2-1; calibración ±0.5 s).
- Si el navegador bloquea el autoplay, el host ve un botón **Reproducir audio**.
- Si no hay archivo (ni path válido ni adjunto), vuelve el respaldo manual:
  buscar el minuto en Spotify/YouTube y darle play al llegar a 0.

El catálogo embebido (`packages/shared/src/catalog.ts`) empieza **vacío a
propósito**: no trae demos ni canciones de prueba. Para tener canciones
jugables, sube una con el wizard **«Sube tu canción»** desde el inicio
(audio + letra + estribillo + tap-sync; queda en la **biblioteca compartida**
de Supabase, visible para todo el grupo) o añade entradas reales en
`catalog.ts` (ver «Añadir canciones» más abajo). Si en el futuro agregas
placeholders (`id` con prefijo `placeholder-` o título `PLACEHOLDER — …`),
esos **no** entran al sorteo de fiesta salvo que no quede otra opción.

El modo por defecto de la sala es **relevo con sorpresa**. El individual y
el karaoke por turnos siguen disponibles en la configuración del lobby.

Si un jugador se desconecta a mitad del relevo y quedan ≥ 2 voces, se
reasignan los turnos futuros (o se regenera el plan si aún no empezó el
audio). Si queda 1 solo, la partida termina. Un bloqueo breve de pantalla
(~12 s) **no** expulsa: hay ventana de gracia de Presence con rejoin.

En modo individual, si se va el cantante de la ronda, esa ronda se marca
fallida y se pasa al marcador.

### Checklist antes de una fiesta

1. Reactiva el proyecto de Supabase si está pausado.
2. Ten al menos una canción jugable: súbela con el wizard «Sube tu canción»,
   o ten un MP3 (en `apps/web/public/audio/` con `audioSource`, o listo para
   adjuntar en Ready).
3. En el lobby puedes fijar la canción (catálogo o «Biblioteca del grupo») o
   dejarla al azar (sin placeholders).
4. En la TV: solo Slay It (sin Spotify Lyrics abiertas).

## Publicar en GitHub Pages (gratis)

1. Sube este repositorio a GitHub.
2. En **Settings → Secrets and variables → Actions → Secrets**, crea:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. En **Settings → Pages**, en **Build and deployment → Source**, elige
   **GitHub Actions**.
4. Haz `git push` a la rama `main`. El workflow
   [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
   instala dependencias, corre typecheck/lint/tests, compila `apps/web` y lo
   publica automáticamente.
5. GitHub mostrará la URL pública (algo como
   `https://tu-usuario.github.io/slay-it/`). Ábrela en la laptop y en los
   teléfonos.

### Cosas a tener en cuenta

- El plan gratuito de Supabase **pausa el proyecto tras ~7 días sin uso**.
  Antes de jugar, entra al dashboard de Supabase y reactívalo si aparece
  pausado.
- El plan gratuito admite hasta 200 conexiones simultáneas y 2 millones de
  mensajes al mes: de sobra para partidas de 2–8 personas.
- La URL y la anon key de Supabase quedan visibles en el código publicado
  (es normal en apps solo-frontend). Como no hay tablas ni datos, el único
  riesgo es que alguien más consuma tu cuota de Realtime; aceptable para un
  juego privado entre amigos.

## Comandos

```powershell
npm run dev        # web con recarga (usa Supabase configurado en .env)
npm run build:web   # build de producción de apps/web (lo usa el workflow)
npm run typecheck   # verifica TypeScript
npm run lint        # ESLint
npm test            # pruebas unitarias
npm run build       # build completo, incluyendo el servidor local opcional
```

### Servidor local opcional (sin internet)

`apps/server` conserva la misma máquina de estados sobre Socket.IO por si más
adelante quieres un modo totalmente sin internet. Hoy `apps/web` no se conecta
a él; usarlo requeriría volver a apuntar el frontend a Socket.IO.

```powershell
npm run build
$env:NODE_ENV="production"
npm start -w @slay-it/server
```

## Añadir canciones

Hay dos formas de tener canciones jugables:

1. **Wizard «Sube tu canción»** (recomendado, es colaborativo): desde la
   pantalla de inicio, cualquiera del grupo sube el MP3, pega/escribe la
   letra, marca qué líneas son el estribillo y sincroniza tocando un botón
   por línea mientras suena. Al guardar sube el audio al bucket
   `song-audio` de Supabase Storage y la letra/timings a la tabla `songs`
   (ver «Configurar Supabase» más arriba). Queda visible de inmediato en la
   «Biblioteca del grupo» de Home y del selector del lobby, en **cualquier
   dispositivo**. Detalle de implementación en `apps/web/src/songs/`
   (`cloudSongStore.ts`, `chorusRanges.ts`, `UploadSongWizard.tsx`).
2. **Catálogo embebido en el repo** (`packages/shared/src/catalog.ts`,
   `demoSongs`) — empieza **vacío a propósito**; útil si quieres canciones
   que viajen con el código (ej. una demo fija que no dependa de Supabase).

Importar un JSON exportado previamente (botón **Exportar** en el lobby) no
trae el audio (pesaría demasiado); al importarlo, la app pide el MP3 para
subirlo también a la biblioteca.

Cada canción se valida con Zod (`songSchema` en `packages/shared/src/model.ts`):

```ts
{
  id: "mi-cancion",
  title: "Título real",
  artist: "Artista",
  duration: 210,
  genre: "pop",
  difficulty: "medium",
  chorusStart: 58,
  sections: [
    {
      id: "verse-1",
      type: "verse",
      start: 42,
      end: 58,
      lineIds: ["line-1", "line-2"]
    }
  ],
  lines: [
    {
      id: "line-1",
      start: 42,
      end: 46,
      text: "Primera línea sincronizada",
      sectionId: "verse-1"
    }
  ],
  // Opcional: archivo en apps/web/public/audio/
  audioSource: { type: "local", path: "/audio/mi-cancion.mp3" }
}
```

### Pasos para añadir una canción real al catálogo del repo

1. Coloca el MP3/M4A en `apps/web/public/audio/` (ver también
   `apps/web/public/audio/README.txt`).
2. Añade una entrada `Song` en el array `demoSongs` de `catalog.ts` con
   título/artista reales, `sections`/`lines` con tiempos en **segundos**
   desde el inicio del audio, y `audioSource.path` apuntando al archivo.
3. Arranca `npm run dev`, crea sala y confirma que Ready diga **Audio listo
   en la app**.

Para que el modo relevo complete dos vueltas con hasta 8 jugadores conviene
tener bastantes secciones cortas (~16 × 2 líneas). Si hay pocas, `planRelay`
reduce vueltas solo. El wizard «Sube tu canción» agrupa la letra en
secciones `verse`/`chorus` según qué líneas se marcaron como estribillo (si
no se marca ninguna, cae en una sola sección `verse`, suficiente para relevo
básico).

## Estructura

- `apps/web`: interfaz React para host y jugadores; el anfitrión ejecuta la
  partida localmente y usa Supabase Realtime como transporte
- `apps/server`: servidor Express + Socket.IO opcional, para un futuro modo
  local sin internet (no usado por el despliegue en GitHub Pages)
- `packages/shared`: contratos, esquema de canciones, catálogo, reglas puras y
  la máquina de estados de la partida (`RoomManager`), compartida por
  `apps/web` y `apps/server`

Las salas y puntuaciones no se guardan en ningún disco ni base de datos. Si el
host se desconecta, la sala se cierra; si un jugador sale, su historial se
elimina.
