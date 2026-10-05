# Fulcro — Entrenador de armwrestling con IA

App web instalable (PWA) que analiza tus ejercicios de armwrestling con la cámara del móvil: mide el ángulo del codo o de la muñeca, cuenta repeticiones, detecta cuándo aparece la fatiga y guarda tu progreso.

**Abrir la app:** https://cgomez2305.github.io/readme/

## Instalar en el móvil
- **Android (Chrome, Brave, Edge):** abre el enlace, toca el menú ⋮ y elige **Instalar app** o **Añadir a pantalla de inicio**.
- **iPhone (Safari):** toca Compartir y luego **Añadir a pantalla de inicio**.

Necesita la cámara (la app pide permiso la primera vez). Después de la primera visita funciona sin conexión, incluido el análisis.

## Qué hace
- **Analizar:** cámara con guía de encuadre, aviso de luz baja y de brazo fuera de cuadro. Detecta el brazo en el propio móvil, mide el ángulo, cuenta repeticiones y graba el vídeo.
- **Informe de serie:** rango, tempo, repetición donde empieza la fatiga (el rango baja un 15% o el tempo sube un 25% frente a las 3 primeras reps; necesita 5 reps) y consejos.
- **Cámara lenta:** revisión a 0.25x, 0.5x o 1x con el esqueleto encima, el punto de fatiga y marcas propias.
- **Progreso:** semana, gráficas de rango y peso por ejercicio, comparación brazo derecho contra izquierdo, historial y dolor reportado.
- **Ejercicios:** press lateral, pronación, supinación, cup, rising y back pressure, cada uno con su articulación medida, objetivos y consejos de cámara. Los umbrales son valores iniciales y hay que ajustarlos con datos reales.
- **Descanso:** temporizador con sonido y vibración, y peso por serie.
- **Plan:** meta semanal, ejercicio por día, racha de semanas y exportación al calendario con aviso.
- **Equipo:** login, código de invitación (máximo 10 personas), actividad semanal y comparación por ejercicio. Requiere Supabase (ver abajo).

### Límites conocidos
- La pronación y la supinación son rotaciones y una cámara 2D solo las ve de forma indirecta.
- Una app web no puede avisarte con la app cerrada. Por eso el recordatorio es un evento semanal para tu calendario.
- El ángulo supone el móvil de lado y con el brazo completo a la vista. Si no, la medida sale mal.
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
- **Logo:** `design/logo.svg` (pivote, antebrazo y arco del ángulo medido).
- **Paleta:** cobre `#FF8A4C` (acción), turquesa `#3FE0C5` (ángulo bueno), ámbar `#FFB347` (atención), grafito `#0E1118`.
- **Tipografías:** Unbounded (títulos) y Figtree (texto), incluidas en `pwa/fonts` (licencia SIL OFL).
- **Modelo de negocio:** primero gratis para el grupo de entrenamiento; después plan Pro por suscripción.

## App Android nativa (archivada)
El proyecto Flutter (`lib/`, `android/`) queda en el repo como primera versión. No es la versión principal: en algunos móviles se cerraba al abrir. Se compila a mano desde la pestaña Actions con el workflow **Build APK**.
