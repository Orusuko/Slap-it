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
  fases, apagón, marcador). Es la única fuente de verdad.
- **Supabase Realtime** (plan gratuito) actúa solo como cable de conexión:
  transporta mensajes entre el anfitrión y los teléfonos. No se crean tablas
  ni se guarda ninguna canción, nombre o puntaje en una base de datos.
- Si el anfitrión cierra la pestaña, la sala se cierra. Si un jugador sale,
  su historial de esa partida se elimina.
- Como el transporte es Supabase (internet), **ya no es obligatorio estar en
  la misma WiFi**: basta con que todos tengan conexión a internet y el mismo
  código de sala.

También se conserva un servidor local opcional (`apps/server`) con la misma
lógica de partida sobre Socket.IO, pensado para un futuro modo 100% sin
internet. La app publicada en GitHub Pages no lo usa ni depende de él.

## Requisitos

- Node.js 20 o posterior
- Una cuenta gratuita en [supabase.com](https://supabase.com) (solo para
  Realtime, sin necesidad de configurar base de datos)

## Configurar Supabase (una sola vez)

1. Crea un proyecto gratuito en supabase.com.
2. Ve a **Settings → API** y copia el **Project URL** y la **anon public
   key**.
3. No necesitas crear ninguna tabla: solo se usa el canal de Realtime.

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
   inicia la cuenta; al 0 arranca el audio (si hay) y la letra.
4. Si el reloj se desfasa, el host recalibra ±0.5 s. Los móviles alinean con
   `hostNow` del broadcast para no ir muy desfasados respecto a la TV.
5. Apagón → reveal → voto / host → marcador.

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
(audio + letra + tap-sync, se guarda en IndexedDB del navegador del host) o
añade entradas reales en `catalog.ts` (ver «Añadir canciones» más abajo). Si
en el futuro agregas placeholders (`id` con prefijo `placeholder-` o título
`PLACEHOLDER — …`), esos **no** entran al sorteo de fiesta salvo que no quede
otra opción.

El modo por defecto de la sala es **relevo con sorpresa**. El individual
sigue disponible en la configuración del lobby.

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
3. En el lobby puedes fijar la canción (catálogo o «Mis canciones») o dejarla
   al azar (sin placeholders).
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

1. **Wizard «Sube tu canción»** (recomendado para jugar rápido): desde la
   pantalla de inicio, sube el MP3, pega/escribe la letra y sincronízala
   tocando un botón por verso mientras suena. Queda guardada en el navegador
   del host (IndexedDB) y aparece en «Mis canciones» del selector del lobby.
   Detalle de implementación en `apps/web/src/songs/`.
2. **Catálogo embebido en el repo** (`packages/shared/src/catalog.ts`,
   `demoSongs`) — empieza **vacío a propósito**; útil si quieres canciones
   que viajen con el código (ej. para GitHub Pages sin depender de
   IndexedDB) en vez de solo en el navegador del host.

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
reduce vueltas solo. El wizard «Sube tu canción» genera automáticamente una
sola sección con todas las líneas, suficiente para relevo básico.

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
