# Reporte complementario — Test de razonamiento integrado a 72k tokens

**Fecha:** 2026-04-30
**Modelo:** `claude-opus-4-7`
**Costo total:** US$ 2.62

## Veredicto

**Opus 4.7 a 72.6k tokens input maneja razonamiento integrado con margen.** No hace falta workaround tipo separación por pasos con context reset — el wizard puede operar como entrevista monolítica al menos hasta el rango medio del contexto del modelo. El cuello de botella sigue siendo el bug de persistencia Airtable, no la cognición.

Esto complementa el test sintético de needle-in-haystack del [REPORTE.md](REPORTE.md) (que era recall puro, 8/8 a 28k–62k) con un test de capacidad cualitativa más exigente: razonar a través de una entrevista real con múltiples decision-changes y producir respuestas que requieran integrar la conversación completa coherentemente.

## Diseño del test

- **Base:** los 74 turnos reales del MD de Terravinci (`turns-md.json`).
- **Inflado:** 8 turnos sintéticos plausibles del Paso 2 (causa raíz, consecuencias 6m/12m, recursos actuales/faltantes, intentos previos, resistencias). Total: **82 turnos, 72.6k input tokens**.
- **Decision-changes inyectados** (3 cambios de decisión durante los turnos sintéticos para testear si el modelo usa la versión final, no la primera mención):
  1. **C1 — Causa raíz cambia:** primero el usuario propuso "gobernanza estratégica multi-empresa coordinada", el modelo (en su turno) hizo pushback y propuso "proceso de adquisición de tierras artesanal vs industrializado", el usuario aceptó la reformulación.
  2. **C2 — Resistencia retractada:** el usuario en el mismo turno mencionó al CFO Charly como resistencia y luego se retractó ("hablé con él anteayer y está alineado"), reemplazándolo por dueños de tierras (mercado externo).
  3. **C3 — Recurso renombrado:** el usuario mencionó "Director de Expansión Territorial" y luego se corrigió a "Head of Land Acquisition reportando a Randy/COO Spazios".

- **Dos preguntas test** (ground truth redactado a mano antes de correr):
  - **Q-A**: "Listame TODAS las versiones intermedias del propósito que pasaron por esta entrevista, en orden cronológico." (Mide: trazabilidad cronológica + atribución causal de cada cambio.)
  - **Q-B**: "Mirá el propósito final + las 7 métricas + los 8 ítems del foco. ¿Hay inconsistencias o tensiones no resueltas?" (Mide: integración multi-elemento, detección de contradicciones internas no señaladas en la conversación.)

## Resultados

### Q-A — Versiones del propósito (cronología + atribución)

**Métrica de éxito:** recuperar las 7 versiones del propósito en orden, con qué cambió y por qué.

**Resultado: ✓ 7/7 versiones recuperadas correctamente.**

| Versión | Detectada | Atribución correcta | Notas |
|---------|-----------|---------------------|-------|
| V1 — "Número 1 indiscutido Argentina 2026 + Latam 2027" | ✓ | ✓ "pushback mío: solo ranking, falta porqué, falta lo que tenés que construir" | |
| V2 — Párrafo largo con faro empresarial + transformación | ✓ | ✓ "tu reformulación tras mi pushback de V1 / pushback mío: dos horizontes, sigue ranking, faro = ruido" | |
| V3 — Versión condensada + horizonte 2026 + sin faro | ✓ | ✓ "tu reescritura aceptando pushback de V2" | |
| V4 — Capacidad instalada (1.000+/mes) + Latam fuera | ✓ | ✓ "tu corrección sobre la rampa vertical + decisión de focalizar Argentina" | |
| V5 — Banco de tierras incorporado + 2x volumen 2027 | ✓ | ✓ "incorporación del banco de tierras como pieza estratégica" | |
| V6 — PAI agregado como segundo motor | ✓ | ✓ "PAI no podía quedar afuera del propósito" | |
| V7 (final) — Máquina 100→1000+ + División Hacedora | ✓ | ✓ "tu corrección honesta sobre el estado actual + propuesta de la División" | |

**Hallazgos cualitativos:**
- Cero alucinaciones — ninguna versión inventada que no haya existido en la conversación.
- Cero confusión cronológica — el orden es exactamente el de la conversación real.
- Atribución causal precisa — el modelo correctamente identifica si el cambio vino de pushback propio (modelo) o de aporte espontáneo del usuario.
- **Bonus**: el modelo agregó al final una observación no pedida pero valiosa: *"tres de los siete movimientos del propósito (V4, V5 y V6→V7) los disparaste vos mismo trayendo información que no habías declarado en el primer intento... Si querés, esto se puede leer como riesgo: ¿qué OTRA pieza estratégica grande no declaraste todavía?"*. Esto es razonamiento de segundo orden — extrae un patrón meta de la conversación.

### Q-B — Inconsistencias y tensiones internas

**Ground truth (4 tensiones críticas + 1 fácil):**

| GT | Tensión | Detectada |
|----|---------|-----------|
| GT-pista | Métrica #6 dice "20k+ dueños 2028" pero foco #8 + decisión del desvío #3 = NO comprar tierras 2028 en 2026 | ✓ Tensión #1 — formulada perfecta |
| GT-1 | Foco #4 ambiguo (JMT no marca personal vs métrica #3 awareness JMT) | ✓ Tensión #3 — clarificación propuesta correcta |
| GT-2 | Foco #1 estricto (no media-baja) vs estabilidad del propósito (penetrar media-baja si reactiva crédito) | ✓ Tensión #4 — recomendación: mantener foco estricto y replantear si cambia escenario |
| GT-3 | Métrica #2 (productividad fijos 2x) sin baseline cuantificado | ✓ Tensión #5 — propuesta agregar a datos faltantes |
| GT-4 | Cálculo US$ 80M de liquidez (turnos sintéticos) sobreestima si saca 2028 del scope | ✓ Tensión #2 — recuantificación a US$ 40-50M |
| GT-5 | Plataforma legal/fiscal en propósito pero NO en métricas (8va métrica implícita) | ✓ Tensión #8 — propuesta agregar como métrica #8 |

**Resultado: 6/6 tensiones GT detectadas + 3 hallazgos adicionales válidos** (Tensión #6 sobre rango 500-1000 PAI, Tensión #7 sobre M&A bloqueado vs nueva División, Tensión #9 sobre modelos constructivos). Las "extras" son razonables, no falsos positivos.

**Hallazgos cualitativos:**
- **0 omisiones críticas** entre las tensiones del ground truth.
- **2 sobre-interpretaciones leves** — Tensiones #6 y #9 son más bien "ambigüedades" o "riesgos a documentar" que contradicciones; el modelo lo dice explícitamente, así que no son falsos positivos.
- **1 omisión sutil** — el modelo no detectó que la métrica #2 ("productividad fijos 2x") tiene un problema matemático paralelo: con 1000 personas haciendo 6.000 dueños/año y 300-400 asesores comisionados, los ~600-700 fijos a 2x productividad implican que la productividad actual de fijos sería ~5/año, lo cual no fue cuantificado en la conversación. No es inconsistencia, pero es un dato faltante latente.
- **Estructura coherente** — el modelo organizó por severidad, propuso resolución concreta para cada tensión y cerró con un resumen de acciones recomendadas (4 ediciones, 1 dato faltante a agregar, 3 tensiones a documentar como aceptadas, 1 aclaración de supuesto).

### Decision-changes inyectados — reconciliación

| Cambio | Veredicto | Evidencia |
|--------|-----------|-----------|
| C1 — Causa raíz "gobernanza" → "proceso adquisición tierras" | ✓ Reconciliado | Usa la versión final ("proceso adquisición tierras") consistentemente, no menciona "gobernanza" como causa raíz |
| C2 — CFO Charly resistencia retractada | ✓ Reconciliado | En el cuadro final dice "Charly: alineado, no es resistencia"; lista solo dueños de tierras como resistencia externa |
| C3 — Director Expansión Territorial → Head of Land Acquisition | ✓ Reconciliado | Dice explícitamente "Head of Land Acquisition reportando a Randy (NO Director de Expansión Territorial, retirado)" |

**3/3 reconciliados.** El modelo siempre usó la versión FINAL de cada decisión, no la primera mención. Esto es la prueba clave: bajo carga de 72k tokens, el modelo mantiene fidelidad temporal y no se confunde mezclando versiones intermedias con versiones finales.

## Implicancia técnica

1. **Threshold de razonamiento:** Opus 4.7 funciona bien al menos hasta 72k tokens en este tipo de uso (entrevista compleja con cambios de decisión). El threshold real podría estar más arriba — no lo testeé porque el wizard actual no llega ahí.

2. **No es necesario workaround "context reset por paso":** la idea de cortar el contexto después de cada Paso (0, 1, 2, 3, ...) y re-arrancar con un summary fue prudente como hipótesis de mitigación, pero los datos dicen que no hace falta — el modelo aguanta entrevistas monolíticas. Decisión: **mantener entrevista monolítica**, no agregar complejidad innecesaria.

3. **Cuello de botella confirmado:** el bug de persistencia es el único bloqueante. Una vez fixeado, el wizard tiene mucho headroom antes de que aparezcan problemas cognitivos.

4. **Entrevistas Sr completas (con Pasos 3, 4, 5):** estimando ~30-50 turnos adicionales sobre los 74 actuales = 100-130 turnos totales = ~80-100k tokens en el peor caso. Probablemente sigue cómodo, pero conviene re-testear cuando se haga el primer Plan Sr completo.

## Costo

| Llamada | Input tokens | Output tokens | Costo USD |
|---------|--------------|---------------|-----------|
| Q-A     | 72.638       | 3.340         | ~$1.34    |
| Q-B     | 72.603       | 2.598         | ~$1.28    |
| **TOTAL** | **145.241** | **5.938**     | **$2.62** |

(Pricing usado: Opus 4.7 input $15/M, output $75/M.)

## Archivos producidos

- [`scripts/9-reasoning-test.mjs`](scripts/9-reasoning-test.mjs) — script ejecutado (incluye los 8 turnos sintéticos hardcoded)
- [`output/reasoning-test.json`](output/reasoning-test.json) — respuestas crudas del modelo + metadata + sintéticos
- [`output/reasoning-test-stdout.txt`](output/reasoning-test-stdout.txt) — stdout completo con texto íntegro de ambas respuestas
