# Fulcro — Entrenador de armwrestling con IA

App nativa para móvil que analiza en vídeo tus ejercicios y técnica de armwrestling y te da feedback comparándote con competidores profesionales.

> Estado: concepto / definición de MVP. Sin código todavía.

## ¿Es posible?
Sí, pero por fases. Lo que sí es viable hoy y lo que no:

| Capacidad | Viabilidad | Cómo |
|---|---|---|
| Detectar postura y ángulos (muñeca, codo, hombro, tronco) | Alta | Estimación de pose en el propio móvil (MediaPipe Pose / MoveNet) |
| Contar repeticiones, tempo, rango de movimiento | Alta | Reglas sobre los ángulos de la pose |
| Comparar tu ejecución con una "referencia" | Media | Alinear secuencias (DTW) entre tu pose y la de un pro |
| Reconocer técnica (hook, top roll, press, king's move) | Media | Clasificador entrenado con vídeos etiquetados |
| Analizar un combate (posición inicial, ventaja, momento de pérdida) | Media-baja | Requiere dos personas, mano y mesa visibles, y datos etiquetados |
| Medir fuerza de muñeca/dedos desde el vídeo | Baja | La cámara no ve fuerza; necesita sensores o dinamómetro externo |

**Punto clave:** no hace falta "entrenar un modelo gigante con vídeos de pros" para empezar. La pose se extrae con modelos ya entrenados; los vídeos de pros sirven para construir *referencias* y, más adelante, un clasificador propio.

## Aviso sobre los vídeos de competidores
Los vídeos de YouTube/Instagram tienen derechos de autor. Para un uso personal de análisis es una zona gris. Para publicar la app o entrenar un modelo comercial necesitas permiso. Opciones: acuerdos con atletas, grabar a compañeros de tu equipo, o guardar solo las poses extraídas (esqueletos), no el vídeo.

## MVP (v0.1)
1. Grabar o subir un vídeo de un ejercicio (curl con polea, pronación, press lateral, rising…).
2. Extraer pose y mostrar el esqueleto superpuesto.
3. Métricas por repetición: ángulo de codo y muñeca, rango, tempo, simetría.
4. Historial y gráficas de progreso por ejercicio.
5. Consejos basados en reglas ("el codo se despega del pad", "bajas demasiado rápido").

## Roadmap
- **v0.2** Biblioteca de referencias de pros (esqueletos) y comparación lado a lado.
- **v0.3** Clasificación de técnica (hook / top roll / press) con modelo propio.
- **v0.4** Análisis de combate: detectar posición inicial, ventaja y momento de pérdida.
- **v0.5** Plan de entrenamiento adaptativo según debilidades detectadas.
- **Futuro** Sensores externos (dinamómetro BLE) para correlacionar fuerza y técnica.

## Stack elegido
- **App:** Flutter (Dart). Un solo código para Android e iOS, genera el APK directamente y tiene buen rendimiento con cámara y gráficos propios.
- **Pose en el dispositivo:** ML Kit Pose Detection (`google_mlkit_pose_detection`), 33 puntos del cuerpo sin servidor ni coste por uso.
- **Backend:** Supabase (Postgres, autenticación, almacenamiento). Código abierto y exportable, sin dependencia de un solo proveedor.
- **ML propio (más adelante):** Python + PyTorch, offline. El modelo entrenado se exporta a TFLite y se ejecuta en el móvil.
- **Suscripciones (fase Pro):** RevenueCat sobre Google Play Billing y App Store.
- **CI/CD:** GitHub Actions para compilar APK/AAB en cada versión.

## Distribución
1. **Ahora:** APK firmado, instalado directamente en los móviles del grupo (`flutter build apk --release`).
2. **Después:** Google Play con pruebas cerradas, usando AAB.
3. **Con suscripción:** Play Store y App Store con RevenueCat.

## Diseño
Interfaz oscura, tipografía fuerte y esqueleto en neón sobre el vídeo; prototipo en Figma antes de programar.

## Siguientes pasos
- [ ] Decidir Flutter vs React Native
- [ ] Elegir 3 ejercicios para el MVP
- [ ] Grabar un dataset propio de ~50 vídeos
- [ ] Prototipo de extracción de pose y cálculo de ángulos
- [ ] Prototipo de UI en Figma

## Identidad (v0)
- **Nombre:** Fulcro, el punto de apoyo de la palanca; en armwrestling, el codo sobre el pad.
- **Logo:** `design/logo.svg` (pivote, antebrazo y arco del ángulo medido).
- **Prototipo de interfaz:** `design/prototype.html` (abrir en el navegador). Oscuro, glassmorphism, 4 pantallas: Inicio, Analizar, Equipo, Técnicas.
- **Paleta:** cobre `#FF8A4C` (acción), turquesa `#3FE0C5` (ángulo bueno), ámbar `#FFB347` (atención), grafito `#0E1118`.
- **Tipografías:** Unbounded (títulos) y Figtree (texto).
- **Modelo de negocio:** primero gratis para el grupo de entrenamiento; después plan Pro por suscripción.
