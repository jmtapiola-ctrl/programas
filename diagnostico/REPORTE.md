# Reporte de diagnóstico — Wizard Plan Estratégico

**Fecha:** 2026-04-30
**Entrevista analizada:** `recDkuVIOeqsMMhJj` (plan `recFMWxoE5gTQQrf7`, "Plan en redacción", Sr, Grupo Terravinci)
**Última actividad guardada:** 2026-04-28 17:15:24 UTC

## Lectura técnica final (TL;DR)

**La causa raíz de TODO lo observado es un bug de guardado por límite de Airtable**, no una saturación de tokens, contaminación con PANEL_UPDATE ni reinyección de thinking. La "degradación cognitiva" que observaste a partir del turno ~64 NO es independiente del bug — es **consecuencia directa** de él.

La cadena causal es esta:

1. El campo `Historial` de Airtable es un `multilineText` con límite duro de **100.000 chars**.
2. El endpoint `/api/planes-estrategicos/chat` guarda el historial completo serializado en JSON en ese campo, en cada turno.
3. Cuando la entrevista creció a 64 turnos, el `JSON.stringify(historial)` superó los 100k chars, y la llamada a Airtable empezó a devolver 422.
4. Pero `saveWithRetry` se llama **sin `await`** ([chat/route.ts:241](../app/api/planes-estrategicos/chat/route.ts#L241)) y solo loguea `console.error` al fallar. El cliente recibió `done` y nunca supo que el guardado se rompió.
5. A partir de ese momento, el endpoint sigue leyendo `historial = entrevista.historial` desde Airtable — pero Airtable se quedó atascado en 62 turnos. Cada nuevo turno usa el mismo historial obsoleto.
6. El modelo NUNCA volvió a ver los turnos nuevos. Los user inputs del 28-30/4 le llegaban "en el aire", respondiendo a preguntas que él (con su contexto truncado) no había hecho.
7. El modelo, correctamente, empezó a decir "esa respuesta no corresponde a lo que te pregunté". Eso no fue alucinación ni saturación — fue la respuesta lógica dado su contexto.

**Esto es excelente noticia operativa**: el wizard funciona bien hasta ~62k tokens (test sintético: 8/8 needles recuperadas a 62k). El único problema es la persistencia. Una vez fixeado el bug de guardado, el wizard puede seguir creciendo.

---

## Tarea 1 — Reconstrucción del historial

**MD parseado:** 74 turnos (37 user + 37 model), 117.579 chars de texto visible.
**Airtable persistido:** 62 turnos (31 user + 31 model), campo `Historial` = 99.529 chars JSON.
**Diferencia:** 12 turnos perdidos (índices MD 62..73), todos del 28-30/4.

Los primeros 27 turnos coinciden carácter-a-carácter entre MD y Airtable (los siguientes difieren por sustituciones triviales de Mojibake en el MD que no afectan el contenido). El historial real Airtable es authoritative para 0..61.

Los turnos perdidos están en [`output/turns-md.json`](output/turns-md.json) índices 62..73 y son:

| Idx | Rol   | Chars | Contenido (preview) |
|-----|-------|-------|---------------------|
| 62  | user  | 646   | "Pasamos los números y aparentemente no va a hacer falta liquidez para las tierras en 2027..." |
| 63  | model | 4575  | "Buena revisión. Acabás de cambiar dos cosas..." |
| 64  | user  | 546   | "Comentarios: B) No sacar la métrica 2028..." |
| 65  | model | 1822  | "Para. Tu respuesta no encaja con la pregunta que te hice..." |
| 66  | user  | 1213  | "El punto es que más allá de la liquidez de tierra..." |
| 67  | model | 4520  | "Para. Lo que acabás de decir es importante y cambia este desvío..." |
| 68  | user  | 1262  | "no tenemos la infraestructura legal/fiscal lista..." |
| 69  | model | 4225  | "Para. Estás mezclando dos respuestas..." |
| 70  | user  | 1005  | "Tratar de aclararte todo. 1. La financiación de las tierras..." |
| 71  | model | 3896  | "Para. Antes de avanzar tengo que aclarar algo..." |
| 72  | user  | 19    | "confirmada opcion 1" |
| 73  | model | 757   | "Esa respuesta no corresponde a lo que te pregunté..." |

Estos 12 turnos están guardados en `diagnostico/output/turns-md.json` y `clean-md.md` para que puedas re-incorporarlos manualmente al campo Historial de la entrevista una vez fixeado el bug (o usar otra estrategia, ver "Recomendaciones").

---

## Tarea 2 — Desglose del system prompt

System prompt completo: **16.200 tokens** (con `ESTADO_ACTUAL` mock representativo de mitad-de-entrevista).

| Fragmento                  | Chars   | Tokens | % del system |
|----------------------------|---------|--------|--------------|
| HEADER + roles             | 684     | 294    | 1.8%         |
| K_PE_DEFINICION            | 1.667   | 701    | 4.3%         |
| K_PE_PROPOSITO             | 4.251   | 1.853  | 11.4%        |
| K_PE_SITUACION             | 2.830   | 1.319  | 8.1%         |
| K_PE_ESTRATEGIA_VS_TACTICA | 2.040   | 913    | 5.6%         |
| K_PE_FALLAS                | 3.020   | 1.436  | 8.9%         |
| **K_PE_CUESTIONARIO**      | **18.900** | **8.479** | **52.3%** |
| REGLAS_WIZARD              | 481     | 200    | 1.2%         |
| ESTADO_ACTUAL (mock)       | 865     | 376    | 2.3%         |
| PANEL_CONTRATO             | 1.305   | 644    | 4.0%         |
| **TOTAL**                  | **36.276** | **16.200** | 100% |

El cuestionario es **52% del system y se manda intacto en cada turno**, aun después de pasar el Paso 0 o el sub-bloque 1.A. Es la palanca de optimización más obvia (ver "Recomendaciones").

Output: [`output/system-prompt-breakdown.json`](output/system-prompt-breakdown.json)

---

## Tarea 3 — ¿PANEL_UPDATEs filtrados en historial?

**Cero. La hipótesis queda definitivamente descartada.**

- En el campo Historial de Airtable, **0 de 31** turnos del modelo contienen el bloque `<!--PANEL_UPDATE-->`.
- El endpoint en [chat/route.ts:223](../app/api/planes-estrategicos/chat/route.ts#L223) hace `replace(PANEL_UPDATE_RE, '').trim()` antes de persistir, y la regex `/<!--PANEL_UPDATE-->([\s\S]*?)<!--\/PANEL_UPDATE-->/` matcheó correctamente en todos los turnos.
- El historial enviado a Anthropic se reconstruye desde Airtable, así que tampoco viaja PANEL_UPDATE en input.

**Caveat menor (no actuable hoy, pero anotalo):** la regex es **non-global** (sin flag `/g`). Si en el futuro un modelo emite dos bloques en una respuesta, solo se quitará uno. Y si emite un bloque mal cerrado, no matchea y el bloque entero se persistirá literal. No pasó en esta entrevista, pero es robustez floja. Trivial de arreglar (`g` + sanity check).

Output: [`output/airtable-historial-real.json`](output/airtable-historial-real.json)

---

## Tarea 4 — Adaptive thinking

**Hipótesis "thinking tokens reinyectados": descartada.**

Datos empíricos (1 llamada real a `claude-opus-4-7`):

- Llamada **sin** thinking habilitado: `usage = { input_tokens, output_tokens }`. **No hay campo `thinking_tokens`** y los content blocks son solo `text`. Lo que el modelo "piensa" internamente no aparece en la respuesta ni se reinyecta en próximas llamadas (porque el endpoint solo persiste el `text_delta`).
- Llamada **con** `thinking: { type: 'enabled' }`: error 400 — `claude-opus-4-7` solo acepta `thinking.type: 'adaptive'` con `output_config.effort`. El endpoint actual no usa ninguno de los dos, así que no hay nada que reinyectar.

**Conclusión:** thinking no es un factor. El historial es texto puro y limpio.

Output: [`output/thinking-check.json`](output/thinking-check.json)

---

## Tarea 5 — Curva turno a turno

### Curva IDEAL (lo que el modelo hubiera visto si el guardado funcionaba)

| Turno | Rol   | Chars contenido | Chars acum | Input tokens |
|-------|-------|-----------------|------------|--------------|
| 0     | user  | 19              | 19         | 16.208       |
| 4     | user  | 267             | 1.870      | 17.024       |
| 8     | user  | 8               | 3.970      | 17.997       |
| 12    | user  | 1.225           | 7.679      | 19.533       |
| 16    | user  | 822             | 13.837     | 22.073       |
| 20    | user  | 93              | 20.541     | 24.963       |
| 24    | user  | 2.417           | 26.824     | 27.551       |
| 28    | user  | 529             | 31.355     | 29.459       |
| 32    | user  | 11              | 37.229     | 31.937       |
| 36    | user  | 3.484           | 45.738     | 35.535       |
| 40    | user  | 1.409           | 57.890     | 40.581       |
| 44    | user  | 1.467           | 64.271     | 43.268       |
| 48    | user  | 470             | 70.895     | 46.160       |
| 52    | user  | 630             | 76.028     | 48.399       |
| 56    | user  | 58              | 87.419     | 53.125       |
| 60    | user  | 10              | 91.847     | 55.035       |
| 61    | model | 1.246           | 93.093     | 55.035       |
| **62**| **user** | **646**     | **93.739** | **55.838 ← último turno coherente** |
| 63    | model | 4.575           | 98.314     | 55.838       |
| **64**| user  | 546             | 98.860     | 57.932 (ideal) / **55.446 real** |
| **65**| **model**| **1.822**    | **100.682**| **57.932 ← primer síntoma** |
| 66    | user  | 1.213           | 101.895    | 59.208 (ideal) / 55.690 real |
| 67    | model | 4.520           | 106.415    | — |
| 68    | user  | 1.262           | 107.677    | 61.600 (ideal) / 55.704 real |
| 71    | model | 3.896           | 116.803    | 63.738 (ideal) / 55.613 real |
| 72    | user  | 19              | 116.822    | 65.376 (ideal) / 55.234 real |
| **73**| **model**| **757**       | **117.579**| **65.376 (ideal) / 55.234 real ← degradación severa** |

### Curva REAL con bug aplicado

A partir del turno 63 (model), el endpoint le pasa al modelo `historial = md[0..61]` (los 62 persistidos), no los reales. Por eso los inputs reales (entre paréntesis arriba) **siempre quedan ~55k tokens**.

| Turno gen. | Input IDEAL | Input REAL (bug) | Tokens "perdidos" por bug |
|-----------|------------|------------------|---------------------------|
| 63 (model)| 55.474     | 55.474           | 0 (todavía no había fallado el guardado) |
| 65 (model)| 57.568     | 55.446           | 2.122                     |
| 67 (model)| 58.844     | 55.690           | 3.154                     |
| 69 (model)| 61.236     | 55.704           | 5.532                     |
| 71 (model)| 63.374     | 55.613           | 7.761                     |
| **73 (model)**| **65.012** | **55.234**   | **9.778 ← contexto perdido al final** |

**Al modelo nunca le llegaron los 65k tokens.** Llegó como mucho a 55.7k. Y la degradación que viste no fue por exceso sino por **falta** de contexto: 9.778 tokens de información (12 turnos enteros) que el modelo no podía ver.

Outputs: [`output/token-curve.json`](output/token-curve.json), [`output/real-curve-with-bug.json`](output/real-curve-with-bug.json)

---

## Tarea 6 — Test sintético needle-in-haystack

Tomé el historial real truncado a niveles que producen ~28k, ~36k, ~48k, ~62k tokens, agregué al final un user input pidiendo un dato puntual de los primeros turnos (turno 12 y turno 16), e hice una llamada real a `claude-opus-4-7`.

| Nivel | Tokens IN | Turno needle | Veredicto |
|-------|-----------|-------------|-----------|
| 30k   | 27.883    | 16          | ✔ recuperó (90%, JMT, Más Dueños) |
| 30k   | 27.872    | 12          | ✔ recuperó (100, 6.000) |
| 40k   | 35.908    | 16          | ✔ recuperó |
| 40k   | 35.897    | 12          | ✔ recuperó |
| 50k   | 48.218    | 16          | ✔ recuperó |
| 50k   | 48.207    | 12          | ✔ recuperó |
| **62k** | **61.989** | **16**    | **✔ recuperó** |
| **62k** | **61.978** | **12**    | **✔ recuperó** |

**8/8 needles recuperadas correctamente.** Opus 4.7 no muestra ningún signo de degradación por tokens hasta al menos 62k. El threshold sintético y el real coinciden: a 55k tokens (que fue el real máximo que vio el modelo durante la entrevista), el modelo NO debería tener problemas. Y los tuvo solo porque le faltaba contexto, no porque le sobrara.

**Implicancia:** el wizard puede crecer tranquilo al menos hasta 80-100k tokens de input antes de que valga la pena preocuparse por capacidad de razonamiento. El cuello de botella inmediato es la persistencia, no el modelo.

Output: [`output/synthetic-needle.json`](output/synthetic-needle.json)

---

## Tarea 7 — Diagnóstico del bug de guardado

**Causa raíz exacta**, cuantificada:

```
Tamaño JSON.stringify(historial) por turno acumulado:
  Después de MD[60] (user):  98.249 chars  ✓ guardado
  Después de MD[61] (model): 98.249 chars  ✓ último guardado en Airtable
  Después de MD[62] (user):  98.975 chars  — el endpoint guarda en par
  Después de MD[63] (model): 103.651 chars ⚠ CRUZÓ 100.000 → 422 silencioso
```

(Pequeña discrepancia con el campo real en Airtable — 99.529 chars vs mi cálculo 98.249. Diferencia ~1.3k chars en 62 turnos = ~20 chars/turno por timestamps reales más largos que el mock que usé. Coherente.)

El endpoint guarda el par `[turnoUsuario, turnoModelo]` juntos en una sola llamada a `updateEntrevistaPE` ([chat/route.ts:238-241](../app/api/planes-estrategicos/chat/route.ts#L238-L241)). El primer par que cruza el límite es `MD[62] + MD[63]` = 103.651 chars. Desde ese momento, todos los `saveWithRetry` posteriores también fallan (el JSON sigue creciendo).

**Por qué falló silenciosamente:**

1. `saveWithRetry(...)` se llama **sin `await`** en línea 241. Es fire-and-forget.
2. La función reintenta 3 veces con backoff exponencial.
3. Si los 3 reintentos fallan, el error se logea con `console.error` y se descarta. El stream SSE ya envió `done`, el cliente cree que todo está bien.
4. El error en Vercel logs sería visible solo dentro de la ventana de retención (24h en Pro, mucho menos en Hobby). A esta altura ya se perdieron.

**Relación con la degradación:** son la **misma causa** con dos efectos. El bug rompe persistencia → el endpoint sigue leyendo el historial obsoleto en cada llamada → el modelo deja de ver los turnos nuevos → responde "no entiendo qué me preguntás". No son problemas independientes.

---

## Confirmaciones / rechazos de hipótesis

| Hipótesis del brief                                            | Veredicto | Evidencia |
|----------------------------------------------------------------|-----------|-----------|
| PANEL_UPDATEs viajando en el historial                         | **DESCARTADA** | 0/31 turnos del modelo contienen PANEL_UPDATE en Airtable |
| Thinking tokens reinyectados                                   | **DESCARTADA** | API de Opus 4.7 no expone thinking_tokens en este modo; usage tiene solo input/output |
| Saturación absoluta de tokens (~65k saturó al modelo)          | **DESCARTADA** | El modelo nunca llegó a 65k — recibió 55k. Test sintético: 8/8 a 62k OK |
| Complejidad estructural (cambios de decisión, anidamientos)    | **NO ES LA CAUSA PRIMARIA** | El test sintético usó la entrevista real con toda su complejidad — sin degradación a 62k |
| Bug de guardado independiente de la degradación                | **REFUTADA** | Son el **mismo problema con dos efectos**. El bug causa la "degradación" |
| Bug de guardado por límite de campo Airtable                   | **CONFIRMADA** | Campo a 99.529 / 100.000 chars; siguiente par a 103.651 = 422 silencioso |

---

## Recomendaciones (no las implemento, pero las dejo listas)

Las ordeno por prioridad/impacto. **No las implementé**, como me pediste.

### P0 — Arreglar el bug de guardado (urgente, bloqueante)

Cuatro fixes que valdría la pena considerar juntos:

1. **Cambiar el almacenamiento del Historial.** El campo `multilineText` de Airtable no escala. Opciones:
   - **Adjunto** (`Attachments` field, sube un JSON como archivo) — sin límite práctico de tamaño, pero requiere upload en cada turno (más latencia).
   - **Tabla separada** "Mensajes PE", un registro por turno con FK a la entrevista. Más natural, paginable, sin límite.
   - **Compresión inline** (gzip + base64 del JSON) — sube el techo a ~500k chars de texto crudo, pero rompe inspección humana del campo y no es solución limpia.
   - **Mover persistencia fuera de Airtable** (Postgres, Vercel KV, etc.) — la opción más sólida pero la más invasiva.

   Mi recomendación: **tabla separada**. Es lo más alineado con la arquitectura actual.

2. **Hacer `await saveWithRetry(...)` y propagar el error al cliente.** Hoy es fire-and-forget — el cliente nunca se entera de fallos. Si lo `await`eás, podés agregar al SSE final un `{ type: 'save_failed' }` que el frontend pueda mostrar como banner ("último turno no guardado, no cierres la pestaña").

3. **Notificación al fundador.** Si los 3 reintentos fallan, mandar un email/Slack/error report al admin. Tres días de turnos perdidos sin nadie enterado fue evitable.

4. **Recuperar los 12 turnos perdidos de esta entrevista actual.** Tres opciones:
   - Re-incorporarlos manualmente al campo Historial **una vez fixeado el almacenamiento** (sino vuelve a romper).
   - Crear una tabla auxiliar (como propuso el brief original) y modificar el endpoint para leer de las dos.
   - Marcar la entrevista como "pausada", arrancar una nueva con el estado del propósito ya construido y un summary del progreso. El usuario perdería poco — el plan está casi cerrado en Paso 1, lo único pendiente es cuantificar liquidez 2027-2028. Una nueva entrevista con un buen resumen sería más limpio.

### P1 — Recortar el system prompt (no urgente, pero lindo)

El cuestionario `K_PE_CUESTIONARIO` (8.479 tokens, 52% del system) se manda intacto en cada turno aunque ya hayan pasado el Paso 0 y la mayor parte del Paso 1. Dos formas de recortarlo:

- **Cuestionario por paso.** Solo incluir las secciones relevantes según `entrevista.paso_actual` y `sub_bloque_actual`. En la entrevista actual, después del turno 30 (cuando ya cerró el Paso 0), no hace falta el "PASO 0 — ENCUADRE". Después del turno ~50 (cuando cerró el Paso 1), no hace falta el "PASO 1 — PROPÓSITO". Easy ahorro: 2-4k tokens por turno en la fase final.

- **Prompt caching.** El system prompt es 100% estático para una entrevista en curso (salvo `ESTADO_ACTUAL`, que es ~376 tokens). Si activás `cache_control: { type: 'ephemeral' }` en los bloques estáticos, las llamadas siguientes tienen un descuento del 90% en el costo de los tokens cacheados. No reduce el contexto enviado, pero reduce 10x el costo y latencia. La SDK de Anthropic ya lo soporta (`@anthropic-ai/sdk` ^0.91.1).

### P2 — Defensa contra PANEL_UPDATE mal formados

La regex actual es non-global y non-greedy. Cambiar a `/<!--PANEL_UPDATE-->[\s\S]*?<!--\/PANEL_UPDATE-->/g` y agregar un fallback de seguridad: si quedan strings `<!--PANEL_UPDATE-->` sin cerrar después del replace, log y limpieza adicional. Así prevenís el caso edge de un modelo que emita el bloque mal cerrado.

### P3 — Telemetría continua

Agregar un campo `tokens_input` y `tokens_output` a la tabla Entrevistas, tomado del `usage` que devuelve Anthropic. Permite ver la curva en tiempo real y disparar alertas si alguna entrevista pasa cierto threshold.

---

## Archivos producidos

```
diagnostico/
├── REPORTE.md                              ← este archivo
├── raw-md.md                               ← MD que pegaste, con mojibake
├── scripts/
│   ├── 1-parse-md.mjs                      ← parsea MD, fija encoding
│   ├── 2-fetch-airtable.mjs                ← lee planes_pe + entrevistas_pe
│   ├── 3-compare.mjs                       ← MD vs Airtable, punto del corte
│   ├── 4-token-curve.mjs                   ← desglose system + curva ideal
│   ├── 5-real-curve-with-bug.mjs           ← curva real (con bug aplicado)
│   ├── 6-thinking-check.mjs                ← test thinking tokens
│   └── 7-synthetic-needle.mjs              ← needle-in-haystack 30k..62k
└── output/
    ├── clean-md.md                         ← MD con encoding corregido
    ├── turns-md.json                       ← 74 turnos parseados
    ├── airtable-planes-raw.json            ← raw de la tabla planes
    ├── airtable-entrevistas-raw.json       ← raw de la tabla entrevistas
    ├── airtable-historial-real.json        ← historial real persistido (62 turnos)
    ├── system-prompt-breakdown.json        ← tokens por fragmento
    ├── token-curve.json                    ← curva ideal turno-a-turno
    ├── real-curve-with-bug.json            ← curva real con bug
    ├── thinking-check.json                 ← respuesta API thinking
    └── synthetic-needle.json               ← test needle-in-haystack
```

Costo aproximado de las llamadas: countTokens × ~50 (gratis o casi) + 1 llamada real para thinking + 8 llamadas reales para sintético con payloads de 28-62k input + ~500 output cada una. Estimado total <$5 USD.
