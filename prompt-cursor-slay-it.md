# Prompt para Cursor (Opus)

Copia todo el bloque de abajo (desde "## Contexto" hasta el final) y pégalo como primer mensaje en Cursor.

---

## Contexto

Quiero construir un juego de fiesta web, inspirado en el segmento "Slay It Don't Spray It" de *That's My Jam*. Se juega en persona, entre amigos, todos conectados a la misma red wifi. No se va a distribuir públicamente ni monetizar — es un proyecto para jugar con mi grupo.

**Idioma:** toda la UI en español.

**Diseño / temática:** karaoke de fiesta. Referencias de vibe (no copiar UI literal): Kahoot, Pinturillo/Gartic Phone — lobby con código, pantallas claras y jugables — pero la identidad visual es **karaoke** (letra grande, ritmo, apagón dramático), no un quiz genérico.

## Concepto del juego

Suena una canción del catálogo, empezando preferentemente en o cerca del **estribillo**. La letra se muestra en pantalla estilo karaoke, sincronizada con el audio. En un momento, la letra se oculta (un "apagón") y el/los jugador(es) responsables de ese fragmento deben seguir cantando de memoria hasta que termine el fragmento. Al terminar el fragmento, **en todas las pantallas** se revela la letra que faltaba. Luego se decide si lo hizo bien o no.

### Audio: enfoque A (MVP) vs enfoque B (largo plazo)

**MVP — Enfoque A (obligatorio ahora):**
- La app **no** reproduce audio de streaming ni usa APIs de Spotify/Apple Music para controlar reproducción.
- El anfitrión pone el audio manualmente desde Spotify/YouTube/etc. por parlantes.
- La app es un **cronómetro + letra sincronizada** en paralelo a ese audio.

**Largo plazo — Enfoque B (no implementar en el MVP, pero el diseño de datos/arquitectura debe dejarlo posible):**
- Poder subir yo (anfitrión) archivos de audio + letra a la app para reproducir dentro del juego, enriquecer el catálogo y hacerlo más “sorpresa” que el algoritmo de Spotify de alguien del grupo.
- El modelo de canciones debe poder crecer hacia un campo opcional de audio local sin reescribir todo.

### Calibración (enfoque A)

Antes de cada ronda: cuenta regresiva **3-2-1**; al llegar a **0** el anfitrión da play en Spotify (u otro) y la app arranca su reloj en ese instante. Debe existir un botón **Recalibrar** por si se desfasa. (Automatizar la sync queda fuera del MVP.)

### Catálogo de canciones

- Set curado a mano al inicio (20–30 canciones de prueba).
- Cada canción: letra en líneas con timestamp (tipo LRC), más metadatos para secciones (estrofas/estribillo) y punto de estribillo.
- Yo cargo los datos; no hay que resolver licencias ni fuentes de letras.
- **Colaborativo / auto-alineación:** fuera del MVP (fase posterior).

## Modos de juego (seleccionables en el lobby)

1. **Individual**: cada jugador tiene su propio turno con una canción/fragmento asignado.
2. **Relevo**: una canción se reparte en N tramos según la cantidad de jugadores; la responsabilidad de “quién canta si hay apagón” rota. Los tramos deben ser por **estrofas/secciones** (no cortar a mitad de frase).

## Flujo de la partida

1. **Lobby**: el anfitrión crea sala con **código** (estilo Kahoot/Pinturillo); los jugadores entran desde el teléfono con ese código (misma wifi). Se define modo, dificultad, voto grupal on/off.
2. **Dificultad del apagón**: duración (una línea / una estrofa / un verso completo) y tipo de ocultamiento:
   - **Total:** no se ve la letra.
   - **Parcial:** se muestra la **primera letra** de cada palabra y el resto como **guiones bajos** (ej. `H____ m____`).
3. **Selección de canción**: aleatoria del catálogo. El punto de arranque preferente es **en o cerca del estribillo** (usar `chorusStart` / secciones en los datos). Nunca iniciar cerca del final de la canción (dejar margen suficiente para el apagón).
4. **Ronda**: calibración 3-2-1 → play manual del host al 0 → letra sync en **todas** las pantallas → apagón en **todas** las pantallas para el fragmento correspondiente → al terminar el fragmento, **reveal** de la letra ocultada en todas las pantallas.
5. **Juicio**:
   - Voto grupal on: todos **excepto quien cantó** votan sí/no desde el teléfono.
   - Voto grupal off: el grupo decide a mano alzada; se confirma en la pantalla anfitriona.
6. **Marcador y fin**:
   - Acierto: **+1**. Fallo: **0**.
   - Modo individual: idealmente **1 ronda por jugador** por partida (luego se puede repetir).
   - Modo relevo: una canción completa repartida; luego otra si quieren.
   - Gana quien más puntos tenga; empates compartidos.
7. **Desconexión**: si alguien abandona, se borra su historial de puntos en esa sala; si vuelve a entrar, cuenta como **jugador nuevo**.

## Personalización requerida

- Jugadores: 2–8
- Modo: individual / relevo
- Dificultad del apagón (duración + oculto total vs parcial con primera letra + guiones)
- Toggle voto grupal
- Filtro de catálogo por género/dificultad (nice-to-have, no bloquea MVP)

## Arquitectura sugerida

- Web app, patrón anfitrión + jugadores-control (Jackbox/Kahoot):
  - **Anfitrión** (laptop/TV): letra, cuenta regresiva, apagón, estado, marcador, código de sala.
  - **Jugador** (móvil): unirse con código, estado de turno, votar.
- Sync en tiempo real en LAN (WebSockets/Socket.io, o realtime gestionado si prefieres).
- Uso local en la misma wifi; sin hosting público obligatorio ni auth compleja.
- Catálogo JSON (o similar), fácil de extender; preparado para un futuro campo de audio local (enfoque B).

## Alcance del MVP

- Enfoque A + calibración 3-2-1 + Recalibrar.
- Modos individual y relevo (tramos por estrofa/sección).
- Apagón total y parcial (primera letra + guiones); reveal post-fragmento en todas las pantallas.
- Lobby con código, juicio, marcador (+1/0), desconexión = jugador nuevo.
- 20–30 canciones de prueba (puedo cargarlas yo).
- UI en español, temática karaoke.
- **Fuera del MVP:** enfoque B (audio in-app), uploads colaborativos, sync automática letra↔audio, APIs de streaming, deploy público.

## Lo que necesito de ti antes de escribir código

1. Propón el stack técnico concreto (frontend, realtime, estructura de carpetas), teniendo en cuenta que el enfoque B es largo plazo y no debe forzar complejidad ahora.
2. Propón el modelo de datos de canciones (líneas + timestamps, `sections` / estrofas, `chorusStart`, y un hueco opcional futuro para audio local).
3. Cuando lo revise y esté de acuerdo, construir por fases:
   1. Lobby + código + conexión de jugadores
   2. Letra sync + calibración + apagón + reveal
   3. Juicio + marcador
