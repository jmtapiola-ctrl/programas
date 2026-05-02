// Smoke test Fase 0.2 — GPT-5.5 con reasoning.effort=high actuando como
// revisor independiente sobre el resumen del Bloque 0+1 del piloto (Plan Sr
// de Terravinci) generado por Augusto/Opus en script 28.
//
// Inputs:
//   - Resumen estructurado del piloto: diagnostico/output/28-resumen-bloque-0-1.md
//   - Conversación completa Paso 0+1 del piloto, cargada desde Airtable
//     (turnos limpios, no del raw que tenía labels invertidos), numerada
//     cronológicamente desde 1.
//
// Output:
//   - JSON estricto contra schema ReviewerReport vía Responses API +
//     text.format json_schema.
//   - Reporte MD con hallazgos completos para verificación manual del usuario.
//   - Métricas: tokens (input + output + reasoning), latencia, costo estimado.
//
// Criterios de éxito (verificación MANUAL del usuario, no automática del script):
//   - ≥80% de hallazgos válidos al verificar contra la conversación raw.
//   - ≥1 hallazgo nuevo que el análisis manual previo no detectó.
//   - Costo total <$5.
//   - Latencia <180s.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'
import { getPlanEstrategico, getEntrevistaPE, getTurnosPE } from '@/lib/airtable'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PLAN_ID = 'recFMWxoE5gTQQrf7'

const REVIEWER_MODEL = process.env.REVIEWER_MODEL ?? 'gpt-5.5'
const REVIEWER_EFFORT = (process.env.REVIEWER_REASONING_EFFORT ?? 'high') as 'none'|'minimal'|'low'|'medium'|'high'|'xhigh'
const REVIEWER_TIMEOUT_MS = Number(process.env.REVIEWER_TIMEOUT_MS ?? 180000)
const REVIEWER_MAX_COST_USD = Number(process.env.REVIEWER_MAX_COST_PER_AUDIT_USD ?? 8)

// Pricing estimado para gpt-5.5 (placeholder — re-calibrar con factura real).
// Conservador: input $5/M, output $25/M. Reasoning tokens cuentan como output.
const PRICE_INPUT_PER_M = 5
const PRICE_OUTPUT_PER_M = 25

// ─── Schema JSON del ReviewerReport (strict) ──────────────────────────────────
const REVIEWER_REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['errors', 'questions', 'cross_block_changes', 'meta'],
  properties: {
    errors: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'tipo', 'severidad', 'que_dice_resumen', 'que_se_dijo_en_conversacion', 'turno_referencia', 'cambio_propuesto'],
        properties: {
          id: { type: 'string' },
          tipo: { type: 'integer', enum: [1, 2, 3, 4] },
          severidad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
          que_dice_resumen: { type: 'string' },
          que_se_dijo_en_conversacion: { type: 'string' },
          turno_referencia: { type: 'integer' },
          cambio_propuesto: { type: 'string' },
        },
      },
    },
    questions: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'categoria', 'pregunta', 'por_que_importa', 'relacion_con_plan', 'placeholder_ejemplo_respuesta'],
        properties: {
          id: { type: 'string' },
          categoria: { type: 'string', enum: ['CRITICA', 'RECOMENDADA'] },
          pregunta: { type: 'string' },
          por_que_importa: { type: 'string' },
          relacion_con_plan: { type: 'string' },
          placeholder_ejemplo_respuesta: { type: 'string' },
        },
      },
    },
    cross_block_changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'bloque_afectado', 'seccion_afectada', 'severidad', 'que_dice_actualmente', 'que_se_declaro_que_lo_modifica', 'turno_referencia', 'cambio_propuesto'],
        properties: {
          id: { type: 'string' },
          bloque_afectado: { type: 'integer' },
          seccion_afectada: { type: 'string' },
          severidad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
          que_dice_actualmente: { type: 'string' },
          que_se_declaro_que_lo_modifica: { type: 'string' },
          turno_referencia: { type: 'integer' },
          cambio_propuesto: { type: 'string' },
        },
      },
    },
    meta: {
      type: 'object',
      additionalProperties: false,
      required: ['errores_alta', 'errores_media', 'errores_baja', 'preguntas_criticas', 'preguntas_recomendadas', 'cross_block_changes_total', 'confianza_general', 'justificacion_confianza'],
      properties: {
        errores_alta: { type: 'integer' },
        errores_media: { type: 'integer' },
        errores_baja: { type: 'integer' },
        preguntas_criticas: { type: 'integer' },
        preguntas_recomendadas: { type: 'integer' },
        cross_block_changes_total: { type: 'integer' },
        confianza_general: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
        justificacion_confianza: { type: 'string' },
      },
    },
  },
} as const

// ─── System prompt del reviewer ──────────────────────────────────────────────
const SYSTEM_PROMPT_REVIEWER = `Sos un consultor estratégico senior que actúa como REVISOR INDEPENDIENTE de un plan estratégico ya cerrado por otro AI (un entrevistador conversacional construido sobre Claude Opus 4.7).

Tu rol NO es generar el plan ni mejorarlo en términos de calidad subjetiva. Tu rol es DETECTAR problemas objetivos y preguntas críticas que faltaron hacer durante la entrevista.

Vas a recibir como input:
1. La conversación completa del Bloque 0+1 (Encuadre + Propósito) entre el ejecutivo y el AI entrevistador, con turnos numerados cronológicamente desde 1.
2. El resumen estructurado generado por el AI entrevistador al cerrar el bloque.

Tu tarea: producir un reporte estructurado en formato JSON con tres bloques (errors, questions, cross_block_changes) + meta.

═══════════════════════════════════════════════════════════════════
CONTEXTO IMPORTANTE
═══════════════════════════════════════════════════════════════════

Estás auditando el Bloque 0+1 (Encuadre + Propósito). El Paso 2 (Situación) y los pasos siguientes (3, 4, 5) NO están en este material — se hacen después. Por lo tanto:
- NO marques como omisión cosas como "falta el desvío principal" — eso es del Paso 2.
- SÍ marcá omisiones del Encuadre y del Propósito mismo: tipo de plan, organización, área, escena ideal, métricas, fuera de scope, horizonte, estabilidad.
- Como es el primer bloque, el bloque "cross_block_changes" debe estar VACÍO ([]).

═══════════════════════════════════════════════════════════════════
BLOQUE A — ERRORES EN EL RESUMEN
═══════════════════════════════════════════════════════════════════

Detectá SOLO problemas objetivos de los siguientes 4 tipos (campo "tipo" del item):
(1) OMISIÓN: información declarada por el usuario en la conversación pero no quedó en el resumen.
(2) DECISIÓN VIOLADA: el usuario pidió algo específico y no se respetó.
(3) ALUCINACIÓN: contenido en el resumen que no aparece en la conversación.
(4) INCONSISTENCIA INTERNA: campos del resumen que se contradicen entre sí.

REGLAS DURAS:
- NO sugieras mejoras de calidad subjetiva.
- NO completes datos faltantes con tus ideas.
- NO inventes contenido.
- Si dudás si algo es error real, NO lo incluyas.
- Si algo ya está marcado como dato faltante en el resumen, NO lo incluyas como omisión.

Para cada error, citá:
- "que_dice_resumen": cita textual breve del resumen.
- "que_se_dijo_en_conversacion": cita textual de la conversación que lo contradice o complementa.
- "turno_referencia": número entero del turno donde se dijo.
- "cambio_propuesto": texto sugerido para arreglar el resumen.

Severidad: Alta = rompe el plan o falsea info crítica. Media = modifica decisión sustantiva pero recuperable. Baja = matiz importante.

Máximo 10 errores. Si encontrás más, priorizá los más graves.

═══════════════════════════════════════════════════════════════════
BLOQUE B — PREGUNTAS QUE FALTARON HACER
═══════════════════════════════════════════════════════════════════

Identificá temas estratégicos relevantes para el éxito del plan que NO se cubrieron en la entrevista.

Clasificá las preguntas en dos categorías (campo "categoria"):
- "CRITICA" (máximo 5): "sin esto, el plan tiene un riesgo concreto de ejecución".
- "RECOMENDADA" (máximo 5): "vale la pena cubrirlo pero el plan no se rompe sin esto".

Para cada pregunta:
- "pregunta": pregunta concreta, accionable.
- "por_que_importa": justificación, máximo 3 oraciones.
- "relacion_con_plan": qué objetivo/decisión del plan se conecta.
- "placeholder_ejemplo_respuesta": ejemplo orientativo de cómo el ejecutivo podría responder.

VERIFICÁ antes de incluir una pregunta: ¿ya está cubierta como dato faltante en el resumen? Si sí, NO la incluyas.

═══════════════════════════════════════════════════════════════════
BLOQUE C — CROSS-BLOCK CHANGES
═══════════════════════════════════════════════════════════════════

Como este es el primer bloque (Bloque 0+1), no hay bloques anteriores que puedan recibir cambios retroactivos. El array "cross_block_changes" debe estar vacío: [].

═══════════════════════════════════════════════════════════════════
META
═══════════════════════════════════════════════════════════════════

En el campo "meta", devolvé conteos exactos de los hallazgos + tu confianza general en el reporte:
- "confianza_general": Alta = encontraste varios errores claros y/o preguntas relevantes con cita textual sólida; Media = algunos hallazgos con menos certeza; Baja = poca señal o conversación poco explícita.
- "justificacion_confianza": máximo 2 oraciones.

═══════════════════════════════════════════════════════════════════
FORMATO DE OUTPUT
═══════════════════════════════════════════════════════════════════

Devolvés EXCLUSIVAMENTE el JSON estructurado según el schema provisto. Sin markdown, sin comentarios, sin notas.`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fixMojibake(s: string): string {
  // Si contiene Ã o Â¿, asumir UTF-8 doble-codificado y des-doblar
  if (s.includes('Ã') || s.includes('Â¿')) {
    return Buffer.from(s, 'latin1').toString('utf8')
  }
  return s
}

async function main() {
  console.log('═'.repeat(72))
  console.log(`Fase 0.2 — Smoke reviewer (${REVIEWER_MODEL}, effort=${REVIEWER_EFFORT})`)
  console.log('═'.repeat(72))

  // 1. Cargar resumen de Augusto
  const resumenPath = path.join(ROOT, 'output', '28-resumen-bloque-0-1.md')
  const resumen = fixMojibake(fs.readFileSync(resumenPath, 'utf8'))
  console.log(`\nResumen del piloto cargado: ${resumen.length.toLocaleString()} chars`)

  // 2. Cargar conversación limpia desde Airtable + numerar cronológicamente.
  //
  // CORTE HARDCODED: turnos 1..44 del Airtable.
  //
  // Razón: el filtro paso_actual <= 1 NO es confiable como corte histórico
  // porque paso_actual se actualiza con el PANEL_UPDATE del modelo y tiene
  // lag (a veces el modelo discute Paso 2 con paso_actual=1, o vuelve a Paso 1
  // con paso_actual=2). En el corpus del piloto, el filtro paso<=1 dio 92
  // turnos contaminados con material del Paso 2 → reviewer marcó como
  // "errores del resumen" cosas que estaban en otro bloque (NO-GO en run #1).
  //
  // El turno 44 del Airtable es el modelo declarando "Paso 1 — completo.
  // Vamos a cuantificar el desvío principal" — cierre conceptual del Bloque 0+1.
  // El resumen de Augusto (script 28) fue generado con solo este material
  // (verificado: no menciona "AI organizativo" ni "800-1.000 personas" que
  // se discutieron después del turno 44 cuando el usuario reabrió el Paso 1).
  //
  // En producción, cuando el feature esté implementado, vamos a tener una
  // marca explícita "cierre del Paso N" que sirva de corte real.
  console.log('Cargando conversación del piloto desde Airtable...')
  const plan = await getPlanEstrategico(PLAN_ID)
  const entrevista = await getEntrevistaPE(PLAN_ID)
  if (!entrevista) throw new Error('entrevista no encontrada')
  const turnosCrudos = await getTurnosPE(entrevista.id)
  console.log(`  Turnos totales en Airtable: ${turnosCrudos.length}`)

  const CORTE_BLOQUE_0_1 = 44
  const turnosBloque0_1 = turnosCrudos.slice(0, CORTE_BLOQUE_0_1)
  console.log(`  Corte aplicado: turnos 1..${CORTE_BLOQUE_0_1} (cierre formal del Paso 1)`)

  // Check defensivo: el último turno debe contener marca de cierre del Paso 1,
  // y NO debe mencionar "Paso 2" como tema activo (señal de contaminación).
  const ultimo = turnosBloque0_1[turnosBloque0_1.length - 1]
  const cierreDeclarado = /paso\s*1.{0,30}(cerrado|completo|cerramos|terminado)/i.test(ultimo.contenido)
  const yaEnPaso2 = /^[\s\S]{0,200}vamos a (arrancar|abordar|comenzar|empezar) (con )?(el )?paso\s*2/i.test(ultimo.contenido)
  console.log(`  Check defensivo del corte:`)
  console.log(`    Último turno declara cierre del Paso 1: ${cierreDeclarado ? '✅' : '⚠ no encuentra patrón'}`)
  console.log(`    Último turno NO empieza Paso 2 explícitamente: ${!yaEnPaso2 ? '✅' : '⚠ ya entra a Paso 2'}`)
  if (!cierreDeclarado) {
    console.warn(`    ⚠ Preview del último turno: "${ultimo.contenido.slice(0, 200)}..."`)
  }

  const conversacionNumerada = turnosBloque0_1
    .map((t, i) => `[Turno ${i + 1}, ${t.rol}]: ${t.contenido}`)
    .join('\n\n')
  console.log(`  Conversación numerada (${turnosBloque0_1.length} turnos): ${conversacionNumerada.length.toLocaleString()} chars`)

  // 3. Construir user message
  const userMessage = `Acá tenés la entrevista completa del Bloque 0+1 (Encuadre + Propósito) del Plan Sr de Terravinci, seguida del resumen estructurado generado por el AI entrevistador al cerrar el bloque. Auditá según las instrucciones del system prompt y devolvé el JSON estructurado.

═════════════════════════════════════════════════════════════
CONVERSACIÓN COMPLETA DEL BLOQUE 0+1 (turnos numerados desde 1)
═════════════════════════════════════════════════════════════

${conversacionNumerada}

═════════════════════════════════════════════════════════════
RESUMEN ESTRUCTURADO GENERADO POR EL AI ENTREVISTADOR
═════════════════════════════════════════════════════════════

${resumen}`

  console.log(`  User message total: ${userMessage.length.toLocaleString()} chars`)

  // 4. Llamada a OpenAI (Responses API + reasoning + json_schema)
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY no encontrada en .env.local')
  const openai = new OpenAI({ apiKey })

  console.log(`\nLlamando a ${REVIEWER_MODEL} (reasoning.effort=${REVIEWER_EFFORT}, timeout=${REVIEWER_TIMEOUT_MS}ms)...`)
  const start = Date.now()

  const response = await openai.responses.create({
    model: REVIEWER_MODEL,
    reasoning: { effort: REVIEWER_EFFORT },
    instructions: SYSTEM_PROMPT_REVIEWER,
    input: userMessage,
    text: {
      format: {
        type: 'json_schema',
        name: 'reviewer_report',
        strict: true,
        schema: REVIEWER_REPORT_SCHEMA as Record<string, unknown>,
      },
    },
    max_output_tokens: 16000,
  }, { signal: AbortSignal.timeout(REVIEWER_TIMEOUT_MS) })

  const latency = Date.now() - start

  // 5. Métricas
  const inputTokens = response.usage?.input_tokens ?? 0
  const outputTokens = response.usage?.output_tokens ?? 0
  const reasoningTokens = response.usage?.output_tokens_details?.reasoning_tokens ?? 0
  const totalTokens = response.usage?.total_tokens ?? 0
  const costUsd = (inputTokens * PRICE_INPUT_PER_M + outputTokens * PRICE_OUTPUT_PER_M) / 1_000_000

  console.log(`\n✔ Respuesta recibida en ${(latency / 1000).toFixed(1)}s`)
  console.log(`  input_tokens:     ${inputTokens.toLocaleString()}`)
  console.log(`  output_tokens:    ${outputTokens.toLocaleString()} (${reasoningTokens.toLocaleString()} de reasoning)`)
  console.log(`  total_tokens:     ${totalTokens.toLocaleString()}`)
  console.log(`  costo estimado:   $${costUsd.toFixed(3)} USD (placeholder pricing input=$${PRICE_INPUT_PER_M}/M, output=$${PRICE_OUTPUT_PER_M}/M)`)

  if (costUsd > REVIEWER_MAX_COST_USD) {
    console.warn(`  ⚠ Costo $${costUsd.toFixed(3)} supera cap de $${REVIEWER_MAX_COST_USD}. Anotar.`)
  }

  // 6. Parsear JSON output
  const outputText = response.output_text
  if (!outputText || outputText.trim().length === 0) {
    throw new Error('output_text vacío en la respuesta del reviewer')
  }

  let report: any
  try {
    report = JSON.parse(outputText)
  } catch (e) {
    console.error('FATAL: Output no es JSON válido pese al schema strict.')
    console.error(outputText.slice(0, 2000))
    throw e
  }

  console.log(`\nHallazgos:`)
  console.log(`  Errores: ${report.errors.length} (Alta=${report.meta.errores_alta} / Media=${report.meta.errores_media} / Baja=${report.meta.errores_baja})`)
  console.log(`  Preguntas críticas: ${report.meta.preguntas_criticas}`)
  console.log(`  Preguntas recomendadas: ${report.meta.preguntas_recomendadas}`)
  console.log(`  Cross-block changes: ${report.meta.cross_block_changes_total}`)
  console.log(`  Confianza general: ${report.meta.confianza_general}`)
  console.log(`  Justificación: ${report.meta.justificacion_confianza}`)

  // 7. Verificación AUTOMÁTICA de criterios técnicos (no semánticos)
  // Criterios del plan, no del timeout configurable
  const CRITERIO_LATENCIA_MAX_MS = 180000
  const CRITERIO_COSTO_MAX_USD = 5
  const cumpleLatencia = latency < CRITERIO_LATENCIA_MAX_MS
  const cumpleCosto = costUsd < CRITERIO_COSTO_MAX_USD
  const tieneHallazgos = report.errors.length > 0 || report.questions.length > 0
  console.log(`\nCriterios técnicos automáticos:`)
  console.log(`  Costo <$5:         ${cumpleCosto ? '✅' : '❌'} ($${costUsd.toFixed(3)})`)
  console.log(`  Latencia <180s:    ${cumpleLatencia ? '✅' : '❌'} (${(latency / 1000).toFixed(1)}s)`)
  console.log(`  Tiene hallazgos:   ${tieneHallazgos ? '✅' : '❌'}`)
  console.log(`\n⚠ Criterios SEMÁNTICOS (≥80% válidos + ≥1 nuevo) requieren verificación manual del usuario contra la conversación raw.`)

  // 8. Guardar JSON + MD reporte
  // Output con sufijo del effort, para preservar runs anteriores y permitir
  // comparaciones (Fase 0.4: high vs xhigh).
  const outDir = path.join(ROOT, 'output')
  const outJson = path.join(outDir, `30-reviewer-smoke-${REVIEWER_EFFORT}.json`)
  const outMd = path.join(outDir, `30-reviewer-smoke-${REVIEWER_EFFORT}.md`)

  fs.writeFileSync(outJson, JSON.stringify({
    ran_at: new Date().toISOString(),
    model: REVIEWER_MODEL,
    reasoning_effort: REVIEWER_EFFORT,
    metrics: {
      latency_ms: latency,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      reasoning_tokens: reasoningTokens,
      total_tokens: totalTokens,
      cost_usd_estimated: costUsd,
      pricing_used: { input_per_m: PRICE_INPUT_PER_M, output_per_m: PRICE_OUTPUT_PER_M },
    },
    technical_criteria: {
      costo_menor_5: cumpleCosto,
      latencia_menor_180s: cumpleLatencia,
      tiene_hallazgos: tieneHallazgos,
    },
    requires_manual_review: {
      hallazgos_validos_80_pct: '<usuario debe verificar cada hallazgo contra la conversación raw>',
      hallazgos_nuevos_vs_analisis_manual: '<usuario debe contrastar con análisis manual previo del piloto>',
    },
    report,
  }, null, 2))

  // MD legible para verificación humana
  const md = `# Fase 0.2 — Smoke reviewer GPT-5.5 effort=${REVIEWER_EFFORT}

Fecha: ${new Date().toISOString()}
Modelo: \`${REVIEWER_MODEL}\` · Reasoning effort: \`${REVIEWER_EFFORT}\`

## Métricas

| Métrica | Valor |
|---|---|
| Latencia | ${(latency / 1000).toFixed(1)}s |
| Input tokens | ${inputTokens.toLocaleString()} |
| Output tokens | ${outputTokens.toLocaleString()} (${reasoningTokens.toLocaleString()} de reasoning) |
| Total tokens | ${totalTokens.toLocaleString()} |
| Costo estimado | $${costUsd.toFixed(3)} (pricing placeholder: input $${PRICE_INPUT_PER_M}/M, output $${PRICE_OUTPUT_PER_M}/M) |

## Criterios técnicos automáticos

- Costo <$5: ${cumpleCosto ? '✅' : '❌'}
- Latencia <180s: ${cumpleLatencia ? '✅' : '❌'}
- Tiene hallazgos: ${tieneHallazgos ? '✅' : '❌'}

## Criterios semánticos — REQUIEREN VERIFICACIÓN MANUAL

1. **≥80% de hallazgos válidos**: revisar cada hallazgo contra la conversación raw del piloto. Marcar válido / inválido / dudoso.
2. **≥1 hallazgo nuevo** vs análisis manual previo del piloto.

## Meta del reporte

- Errores totales: **${report.errors.length}** (Alta=${report.meta.errores_alta} · Media=${report.meta.errores_media} · Baja=${report.meta.errores_baja})
- Preguntas críticas: **${report.meta.preguntas_criticas}**
- Preguntas recomendadas: **${report.meta.preguntas_recomendadas}**
- Cross-block changes: ${report.meta.cross_block_changes_total} (debe ser 0 para Bloque 0+1)
- **Confianza general:** ${report.meta.confianza_general}
- Justificación: ${report.meta.justificacion_confianza}

---

## Errores detectados (${report.errors.length})

${report.errors.length === 0 ? '_(ninguno)_' : report.errors.map((e: any, i: number) => `### ${i + 1}. [${e.severidad}] ${e.id} (tipo ${e.tipo})

- **Qué dice el resumen:** ${e.que_dice_resumen}
- **Qué se dijo en la conversación (turno ${e.turno_referencia}):** ${e.que_se_dijo_en_conversacion}
- **Cambio propuesto:** ${e.cambio_propuesto}
`).join('\n')}

## Preguntas críticas (${report.questions.filter((q: any) => q.categoria === 'CRITICA').length})

${(() => {
  const criticas = report.questions.filter((q: any) => q.categoria === 'CRITICA')
  return criticas.length === 0 ? '_(ninguna)_' : criticas.map((q: any, i: number) => `### C${i + 1}. ${q.id}

**Pregunta:** ${q.pregunta}

- **Por qué importa:** ${q.por_que_importa}
- **Relación con el plan:** ${q.relacion_con_plan}
- **Ejemplo de respuesta:** ${q.placeholder_ejemplo_respuesta}
`).join('\n')
})()}

## Preguntas recomendadas (${report.questions.filter((q: any) => q.categoria === 'RECOMENDADA').length})

${(() => {
  const recom = report.questions.filter((q: any) => q.categoria === 'RECOMENDADA')
  return recom.length === 0 ? '_(ninguna)_' : recom.map((q: any, i: number) => `### R${i + 1}. ${q.id}

**Pregunta:** ${q.pregunta}

- **Por qué importa:** ${q.por_que_importa}
- **Relación con el plan:** ${q.relacion_con_plan}
- **Ejemplo de respuesta:** ${q.placeholder_ejemplo_respuesta}
`).join('\n')
})()}

## Cross-block changes (${report.cross_block_changes.length})

${report.cross_block_changes.length === 0 ? '_(ninguno — esperado para el primer bloque)_' : report.cross_block_changes.map((c: any) => `- [${c.severidad}] Bloque ${c.bloque_afectado} > ${c.seccion_afectada}: ${c.cambio_propuesto}`).join('\n')}
`

  fs.writeFileSync(outMd, md)

  console.log(`\nReportes guardados:`)
  console.log(`  ${outMd}`)
  console.log(`  ${outJson}`)
  console.log(`\n→ Verificación manual del usuario pendiente para declarar GO/NO-GO de Fase 0.2.`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
