# Fulcro — Entrenador de armwrestling con IA

App web instalable (PWA) que analiza tus ejercicios de armwrestling con la cámara del móvil: mide el ángulo del codo o de la muñeca, cuenta repeticiones, detecta cuándo aparece la fatiga y guarda tu progreso.

**Abrir la app:** https://cgomez2305.github.io/readme/

## Instalar en el móvil
- **Android (Chrome, Brave, Edge):** abre el enlace, toca el menú ⋮ y elige **Instalar app** o **Añadir a pantalla de inicio**.
- **iPhone (Safari):** toca Compartir y luego **Añadir a pantalla de inicio**.

Necesita la cámara (la app pide permiso la primera vez). Después de la primera visita funciona sin conexión, incluido el análisis.

## Qué hace
- **Analizar:** cámara con aviso de luz baja y de brazo fuera de cuadro. Detecta el brazo en el propio móvil, mide el ángulo, cuenta repeticiones y graba el vídeo. Con un plan activo solo deja elegir los ejercicios de ese día, y en días de descanso o sparring no abre la cámara.
- **Conteo de repeticiones:** una repetición es un ciclo completo (arriba, abajo y arriba) y cada tramo tiene que moverse al menos la mitad del rango objetivo del ejercicio (mínimo 8°). No depende de ángulos absolutos, así que funciona con cualquier posición de cámara. Para ejercicios de muñeca no hace falta que se vea el hombro.
- **Si no cuenta nada, te explica por qué:** el informe dice cuánto tiempo vio tu brazo, cuánto se movió el ángulo y qué cambiar. En vivo avisa de "No veo tu brazo" y, si ve el otro brazo, te deja cambiar con un toque.
- **Borrar grabaciones:** elimina una serie (también desde Analizar, justo después de grabar), todas las de un día (toca el día en Progreso) o reinicia la semana entera. Siempre pide confirmación y borra también el vídeo y, con un grupo conectado, el resumen compartido.
- **Cámara a elegir:** usa la **cámara frontal (selfie)** por defecto, para que te veas mientras entrenas. Se puede cambiar a la trasera, o elegir un lente concreto si el móvil tiene varios. La elección se recuerda.
- **Informe de serie:** rango, tempo, repetición donde empieza la fatiga (el rango baja un 15% o el tempo sube un 25% frente a las 3 primeras reps; necesita 5 reps) y consejos.
- **Cámara lenta:** revisión a 0.25x, 0.5x o 1x con el esqueleto encima, el punto de fatiga y marcas propias.
- **Progreso:** semana, gráficas por ejercicio, comparación brazo derecho contra izquierdo, historial y dolor reportado.
- **Descanso:** temporizador con sonido y vibración, y peso por serie.
- **Plan:** planes semanales personalizados con y sin sparring, ciclo de 4 semanas con descarga, kg según tu 1RM, racha de semanas y exportación al calendario con aviso.
- **Equipo:** login, código de invitación (máximo 10 personas), actividad semanal y comparación por ejercicio. Requiere Supabase (ver abajo).

## Ejercicios y guía básica
Frecuencia e intensidad son recomendaciones generales de un entrenador de armwrestling. No sustituyen a un entrenador ni a un médico.

| Ejercicio | Frecuencia por semana | Qué mide la app |
|---|---|---|
| Rising | máx. 2 | ángulo de muñeca y repeticiones |
| Pronación | máx. 2 | ángulo de muñeca (indirecto) |
| Supinación | máx. 2 | ángulo de muñeca (indirecto) |
| Cupping | 3 a 4, según la intensidad | ángulo de muñeca y repeticiones |
| Aducción de muñeca | máx. 2 | ángulo de muñeca y repeticiones |
| Retención de dedos | 2 a 3 | tiempo bajo tensión y firmeza de la muñeca |
| Pulgar | se puede todos los días | tiempo bajo tensión y firmeza de la muñeca |
| Side pressure | máx. 1 si hay sparring, 2 si no | ángulo de codo y repeticiones |
| Bloque / Up pressure | máx. 2 | ángulo de codo y repeticiones |

- **Intensidad:** trabajar con el **60% del 1RM**, y en side pressure con el **30-40%**. Defines tu 1RM por ejercicio en Analizar y la app te dice cuántos kg usar.
- **Nunca ir al máximo ni al fallo:** la tendinitis aparece al fallo. La app avisa si usas más del 10% por encima de la guía, si pasas del 90% de tu 1RM y cuando detecta fatiga en la serie.
- **Frecuencia:** Analizar avisa cuando ya llegaste al máximo semanal del ejercicio, y Plan avisa si le asignas demasiados días. Con el interruptor de sparring, side pressure baja a una vez por semana.

## Planes personalizados
En **Plan** eliges si la semana tiene **sparring (domingo)** o no, los **días de gimnasio** (3 a 5 con sparring, 3 a 6 sin él) y la **semana del ciclo** (S1, S2, S3 y Descarga). La app arma la semana completa, la revisa contra la guía y, con tus 1RM, te dice los kg de cada serie. Con "Usar este plan" queda activo: **Inicio** muestra la sesión de hoy, **Analizar** muestra la prescripción y puedes exportarlo al calendario. Cada día se puede editar a mano y la app avisa si rompes alguna regla.

Reglas que cumple todo plan generado (hay pruebas automáticas para todas las combinaciones):
- **Frecuencia de tu entrenador:** ningún ejercicio pasa de su máximo semanal. Cupping busca 3 días y Retención de dedos 2. Side pressure es 1 vez con sparring y hasta 2 sin él. El pulgar va como complemento corto todos los días.
- **Intensidad:** 60% del 1RM, y 30-40% en side pressure. Nunca al fallo: cada serie termina con 2 repeticiones en reserva.
- **Recuperación de tendones (reglas nuestras):**
  - El mismo ejercicio, o el mismo grupo de tendón, no se entrena dos días seguidos.
  - Con sparring el domingo cuenta como día duro para todos los grupos. Por eso el sábado es descanso total y el lunes solo lleva trabajo ligero (Cupping al 50% y pulgar).
  - Máximo 3 ejercicios por sesión y siempre hay un día de descanso completo.
  - Cada ciclo termina con una semana de **descarga** (alrededor de un 40% menos de series).
- **Brazo débil:** si en los últimos 30 días un brazo tiene al menos un 8% menos de rango o tiempo, ese brazo recibe una serie extra.
- Las series, repeticiones, descansos y el ciclo de 4 semanas son sugerencias generales nuestras, no de tu entrenador.

Ejemplos de semana (S1):

**Con sparring, 5 días**
| Día | Ejercicios |
|---|---|
| Lunes | Cupping (ligero), Pulgar (ligero) |
| Martes | Retención de dedos, Rising, Aducción de muñeca, Pulgar |
| Miércoles | Cupping, Pronación, Supinación, Pulgar |
| Jueves | Side pressure, Bloque / Up pressure, Rising, Pulgar |
| Viernes | Cupping, Retención de dedos, Pronación, Pulgar |
| Sábado | Descanso |
| Domingo | Sparring |

**Sin sparring, 6 días**
| Día | Ejercicios |
|---|---|
| Lunes | Cupping, Rising, Bloque / Up pressure, Pulgar |
| Martes | Retención de dedos, Pronación, Supinación, Pulgar |
| Miércoles | Cupping, Aducción de muñeca, Pulgar |
| Jueves | Side pressure, Supinación, Pronación, Pulgar |
| Viernes | Cupping, Rising, Aducción de muñeca, Pulgar |
| Sábado | Retención de dedos, Bloque / Up pressure, Side pressure, Pulgar |
| Domingo | Descanso |

Si tienes menos días, el plan sigue cumpliendo las reglas pero avisa de lo que no llega a la guía (por ejemplo, Cupping con solo 2 días).

## Límites conocidos
- La pronación y la supinación son rotaciones y una cámara 2D solo las ve de forma indirecta.
- Una app web no puede avisarte con la app cerrada. Por eso el recordatorio es un evento semanal para tu calendario.
- El brazo completo tiene que verse en la imagen. Si no, la medida sale mal.
- Los objetivos de cada ejercicio (rango y tempo) son valores iniciales y hay que ajustarlos con datos reales.
- La detección necesita ver una parte del cuerpo suficiente: si solo se ve la mano y el antebrazo muy de cerca, puede no encontrar a la persona. Con la cámara frontal, apoya el móvil de modo que se vean el codo y la mano, y mejor también el torso.
- La app guarda las series en el navegador del móvil. Si borras los datos del sitio o desinstalas, se pierden (con un grupo conectado se conserva el resumen en la nube).

## Privacidad
El análisis corre en tu móvil. El vídeo y los puntos del cuerpo no salen del dispositivo. La app bloquea cualquier conexión que no sea a su propio sitio o a tu proyecto de Supabase. Con un grupo conectado solo se suben los resúmenes de cada serie (ejercicio, peso, repeticiones, rango, tempo, dolor).

## Grupo (Supabase)
1. Crea un proyecto gratis en supabase.com.
2. En **SQL Editor** pega y ejecuta `supabase/schema.sql`.
3. En **Authentication > Providers > Email** desactiva "Confirm email" si no quieres que cada persona confirme su correo.
4. En GitHub, en *Settings > Secrets and variables > Actions > Variables*, crea `SUPABASE_URL` (la URL del proyecto) y `SUPABASE_KEY` (la clave publicable).
5. Lanza de nuevo el workflow **Deploy PWA** (pestaña Actions, Run workflow). La app se vuelve a publicar con el grupo activado.

Las tablas tienen reglas de acceso: cada persona solo ve sus datos y los de su grupo.

## Publicación
Cada cambio en `pwa/` ejecuta `.github/workflows/deploy-pwa.yml`: pasa las pruebas y publica la carpeta en la rama `gh-pages`. En el repo hay que tener activado *Settings > Pages > Deploy from a branch > gh-pages / root*.

## Desarrollo
```text
pwa/
  index.html, manifest.webmanifest, sw.js   shell, instalación y modo sin conexión
  css/app.css                               interfaz oscura con vidrio
  js/analysis.js                            ángulos, repeticiones, fatiga, progreso (puro, con pruebas)
  js/pose.js                                detección del brazo (MediaPipe) y dibujo del esqueleto
  js/screens/                               Inicio, Analizar, Informe, Cámara lenta, Progreso, Equipo, Plan
  vendor/                                   MediaPipe, modelo y cliente de Supabase incluidos (sin CDN)
  tests/                                    pruebas con node --test
```
```bash
node --test pwa/tests/*.test.mjs      # pruebas del análisis
python3 -m http.server -d pwa 8000     # probar en http://localhost:8000 (la cámara funciona en localhost)
```
Para probar en el móvil hace falta https, que da GitHub Pages.

## Identidad
- **Nombre:** Fulcro, el punto de apoyo de la palanca; en armwrestling, el codo sobre el pad.
- **Logo:** `pwa/icons/icon.svg` (pivote, antebrazo y arco del ángulo medido).
- **Paleta:** cobre `#FF8A4C` (acción), turquesa `#3FE0C5` (ángulo bueno), ámbar `#FFB347` (atención), grafito `#0E1118`.
- **Tipografías:** Unbounded (títulos) y Figtree (texto), incluidas en `pwa/fonts` (licencia SIL OFL).
- **Modelo de negocio:** primero gratis para el grupo de entrenamiento; después plan Pro por suscripción.
