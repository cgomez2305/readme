# ArmIQ — Entrenador de armwrestling con IA

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

## Stack propuesto
- **App:** Flutter o React Native (iOS + Android con un solo código).
- **Pose en dispositivo:** MediaPipe Pose (privacidad y sin coste de servidor).
- **Backend (opcional):** Python + FastAPI para entrenar modelos y guardar referencias.
- **ML:** PyTorch para el clasificador de técnica; DTW para comparar secuencias.
- **Datos:** Supabase/Firebase para usuarios e historial.

## Diseño
Interfaz oscura, tipografía fuerte y esqueleto en neón sobre el vídeo; prototipo en Figma antes de programar.

## Siguientes pasos
- [ ] Decidir Flutter vs React Native
- [ ] Elegir 3 ejercicios para el MVP
- [ ] Grabar un dataset propio de ~50 vídeos
- [ ] Prototipo de extracción de pose y cálculo de ángulos
- [ ] Prototipo de UI en Figma
