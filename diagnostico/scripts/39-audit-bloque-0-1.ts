// Audit retroactivo del Bloque 0-1 (Encuadre + Propósito) del Plan Sr de
// Terravinci. Modo READ-ONLY / EDUCATIVO.
//
// Material auditado:
//   - Conversación: turnos 1-44 del Airtable (cierre conceptual del Paso 1
//     en turno 44: "Paso 1 — completo. Vamos a cuantificar el desvío principal").
//   - Resumen: el del piloto manual generado por Augusto en script 28
//     (`diagnostico/output/28-resumen-bloque-0-1.md`).
//
// IMPORTANTE: el plan estructurado actual en Airtable refleja el estado al
// cierre del Paso 2 (con ajustes posteriores como "AI organizativo", "División
// Hacedora de Dueños", etc.). NO se usa el plan vivo como input — solo el
// resumen del piloto que matchea el material conversacional.
//
// Resultado:
//   - Reviewer turn persistido en Turnos_PE con read_only=true + via_script=true.
//   - NO modifica el plan curado.
//   - NO incrementa Auditorias Paso 1 Count (esto es educativo, no consume slot).
//   - NO transiciona sub_estado_paso (el estado actual es 'completo' o similar
//     post-cierre del Paso 2).
//
// UI: cuando se navega a /cierre/1 con este reviewer turn, AuditFlowClient
// detecta readOnly=true y la Pantalla 3 muestra "Cerrar — los hallazgos quedan
// registrados" en lugar del flow de apply.
//
// Costo esperado: $0.40-0.80 USD (similar al smoke 0.2 = $0.44).
// Tiempo esperado: 200-270s (latencia baseline gpt-5.5 effort=high).
//
// Uso:
//   REVIEWER_TIMEOUT_MS=300000 npx tsx --env-file=.env.local diagnostico/scripts/39-audit-bloque-0-1.ts

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getEntrevistaPE,
  getTurnosPE,
  appendReviewerTurno,
} from '@/lib/airtable'
import { callReviewer } from '@/lib/openai-client'
import { buildReviewerSystemPrompt, buildReviewerUserMessage } from '@/lib/reviewer-prompt'
import { validateReviewerReport, REVIEWER_REPORT_SCHEMA } from '@/lib/reviewer-validator'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PLAN_ID = 'recFMWxoE5gTQQrf7'  // Plan Sr de Terravinci
const CORTE_BLOQUE_0_1 = 44   // turno 44 del Airtable = "Paso 1 — completo"

function fixMojibake(s: string): string {
  if (s.includes('Ã') || s.includes('Â¿')) {
    return Buffer.from(s, 'latin1').toString('utf8')
  }
  return s
}

async function main() {
  console.log('═'.repeat(72))
  console.log('AUDIT RETROACTIVO — Bloque 0-1 del Plan Sr de Terravinci')
  console.log('Modo: READ-ONLY / EDUCATIVO')
  console.log('═'.repeat(72))

  // ── Cargar entrevista + turnos ──
  const entrevista = await getEntrevistaPE(PLAN_ID)
  if (!entrevista) throw new Error('Entrevista no encontrada')
  console.log(`\nEntrevista: ${entrevista.id}`)

  const allTurnos = await getTurnosPE(entrevista.id)
  console.log(`Turnos totales en Airtable: ${allTurnos.length}`)

  const turnosBloque = allTurnos.slice(0, CORTE_BLOQUE_0_1).filter(t => t.rol === 'user' || t.rol === 'model')
  console.log(`Corte aplicado: turnos 1..${CORTE_BLOQUE_0_1}`)
  console.log(`Turnos del Bloque 0-1 (user|model): ${turnosBloque.length}`)

  // Verificación defensiva del corte: el último turno debe declarar cierre.
  const ultimo = allTurnos[CORTE_BLOQUE_0_1 - 1]
  const cierreDeclarado = /paso\s*1.{0,30}(cerrado|completo|terminado)/i.test(ultimo?.contenido ?? '')
  console.log(`Check defensivo del corte: ${cierreDeclarado ? '✅ último turno declara cierre del Paso 1' : '⚠ último turno NO declara cierre — verificá manualmente'}`)
  if (!cierreDeclarado) {
    console.log(`  Preview turno ${CORTE_BLOQUE_0_1}: "${ultimo?.contenido?.slice(0, 200)}..."`)
  }

  // ── Cargar resumen del piloto (Augusto) ──
  const resumenPath = path.join(ROOT, 'output', '28-resumen-bloque-0-1.md')
  if (!fs.existsSync(resumenPath)) {
    throw new Error(`No se encontró el resumen del piloto en ${resumenPath}. Re-correr script 28 primero.`)
  }
  const resumenMd = fixMojibake(fs.readFileSync(resumenPath, 'utf8'))
  console.log(`\nResumen del piloto cargado: ${resumenMd.length.toLocaleString()} chars`)

  // ── Construir prompts (modo histórico/educativo) ──
  const systemPrompt = buildReviewerSystemPrompt(1, { historicoEducativo: true })
  const userMessage = buildReviewerUserMessage({
    bloque: 1,
    turnos: turnosBloque,
    resumenEstructurado: resumenMd,
  })
  console.log(`\nSystem prompt: ${systemPrompt.length.toLocaleString()} chars`)
  console.log(`User message: ${userMessage.length.toLocaleString()} chars`)

  // ── Llamada al reviewer ──
  console.log('\nLlamando a gpt-5.5 (effort=high) — audit retroactivo del Bloque 0-1...')
  console.log('(Latencia esperada: 200-270s)')

  const result = await callReviewer({
    systemPrompt,
    userMessage,
    schema: REVIEWER_REPORT_SCHEMA as unknown as Record<string, unknown>,
    schemaName: 'reviewer_report',
    maxOutputTokens: 16000,
    onProgress: (ms) => process.stdout.write(`  ⏱  ${(ms / 1000).toFixed(0)}s...\r`),
  })
  console.log('')

  if (!result.ok) {
    console.error(`\n❌ FAIL: callReviewer reason=${result.reason}`)
    console.error(`Detalle: ${result.details}`)
    console.error(`Métricas: ${JSON.stringify(result.metrics)}`)
    process.exit(1)
  }
  console.log(`✔ Reviewer respondió en ${(result.metrics.latency_ms / 1000).toFixed(1)}s`)
  console.log(`  Tokens: input=${result.metrics.input_tokens.toLocaleString()}, output=${result.metrics.output_tokens.toLocaleString()} (reasoning=${result.metrics.reasoning_tokens.toLocaleString()})`)
  console.log(`  Costo: $${result.metrics.cost_usd.toFixed(3)} USD`)

  // ── Validar shape ──
  const validation = validateReviewerReport(result.data, 1)
  if (!validation.ok) {
    console.error(`\n❌ FAIL: validation rejected. Errors:`)
    for (const e of validation.errors.slice(0, 5)) console.error(`  - ${e}`)
    process.exit(1)
  }
  const report = validation.data
  console.log(`\nReport válido:`)
  console.log(`  Errors: ${report.errors.length} (Alta=${report.meta.errores_alta} / Media=${report.meta.errores_media} / Baja=${report.meta.errores_baja})`)
  console.log(`  Preguntas críticas: ${report.meta.preguntas_criticas}`)
  console.log(`  Preguntas recomendadas: ${report.meta.preguntas_recomendadas}`)
  console.log(`  Cross-block: ${report.meta.cross_block_changes_total}`)
  console.log(`  Confianza: ${report.meta.confianza_general}`)
  console.log(`  Justificación: ${report.meta.justificacion_confianza}`)

  // ── Persistir turno reviewer con read_only=true + via_script=true ──
  console.log('\nPersistiendo turno reviewer en Turnos_PE (read_only=true, via_script=true)...')
  const indice = allTurnos.length
  const reviewerTurno = await appendReviewerTurno(entrevista.id, indice, {
    paso: 1,
    bloqueAuditado: 1,
    modelo: result.metrics.model,
    report,
    costo_usd: result.metrics.cost_usd,
    latencia_ms: result.metrics.latency_ms,
    retry_count: result.metrics.retries_used,
    read_only: true,
    via_script: true,
  })
  console.log(`✔ Turno reviewer creado: ${reviewerTurno.id}`)

  // ── Guardar reporte JSON local + MD legible ──
  const outDir = path.join(ROOT, 'output')
  const outJson = path.join(outDir, '39-audit-bloque-0-1.json')
  const outMd = path.join(outDir, '39-audit-bloque-0-1.md')

  fs.writeFileSync(outJson, JSON.stringify({
    ran_at: new Date().toISOString(),
    plan_id: PLAN_ID,
    entrevista_id: entrevista.id,
    reviewer_turno_id: reviewerTurno.id,
    bloque: '0-1',
    corte: { turnos_desde: 1, turnos_hasta: CORTE_BLOQUE_0_1 },
    fuente_resumen: 'piloto manual Augusto (script 28)',
    metrics: {
      latency_ms: result.metrics.latency_ms,
      cost_usd: result.metrics.cost_usd,
      input_tokens: result.metrics.input_tokens,
      output_tokens: result.metrics.output_tokens,
      reasoning_tokens: result.metrics.reasoning_tokens,
    },
    report,
  }, null, 2))

  // MD legible.
  const md = `# Audit retroactivo Bloque 0-1 — Plan Sr de Terravinci

Fecha: ${new Date().toISOString()}
Plan ID: \`${PLAN_ID}\`
Reviewer turno: \`${reviewerTurno.id}\`
Modelo: \`${result.metrics.model}\` · Reasoning effort: \`${result.metrics.effort}\`

## Material auditado

- Conversación: turnos 1-${CORTE_BLOQUE_0_1} del Airtable (${turnosBloque.length} turnos user/model).
- Resumen: piloto manual del script 28 (\`28-resumen-bloque-0-1.md\`, ${resumenMd.length} chars).
- Modo: **read-only / educativo** — los hallazgos quedan registrados pero NO se aplican al plan vivo.

## Métricas

| Métrica | Valor |
|---|---|
| Latencia | ${(result.metrics.latency_ms / 1000).toFixed(1)}s |
| Costo | $${result.metrics.cost_usd.toFixed(3)} USD |
| Input tokens | ${result.metrics.input_tokens.toLocaleString()} |
| Output tokens | ${result.metrics.output_tokens.toLocaleString()} (${result.metrics.reasoning_tokens.toLocaleString()} de reasoning) |
| Confianza general | **${report.meta.confianza_general}** |

## Hallazgos

- **${report.errors.length} errores** (${report.meta.errores_alta} Alta · ${report.meta.errores_media} Media · ${report.meta.errores_baja} Baja)
- **${report.meta.preguntas_criticas} preguntas críticas** + **${report.meta.preguntas_recomendadas} recomendadas**
- Cross-block changes: ${report.meta.cross_block_changes_total} (esperado 0 para Bloque 1)

## Errores detectados (${report.errors.length})

${report.errors.length === 0 ? '_(ninguno)_' : report.errors.map((e, i) => `### ${i + 1}. [${e.severidad}] ${e.id} (tipo ${e.tipo})

- **Qué dice el resumen:** ${e.que_dice_resumen}
- **Qué se dijo en la conversación (turno ${e.turno_referencia}):** ${e.que_se_dijo_en_conversacion}
- **Cambio propuesto:** ${e.cambio_propuesto}
`).join('\n')}

## Preguntas críticas (${report.questions.filter(q => q.categoria === 'CRITICA').length})

${report.questions.filter(q => q.categoria === 'CRITICA').map((q, i) => `### C${i + 1}. ${q.id}

**Pregunta:** ${q.pregunta}

- **Por qué importa:** ${q.por_que_importa}
- **Relación con el plan:** ${q.relacion_con_plan}
- **Ejemplo de respuesta:** ${q.placeholder_ejemplo_respuesta}
`).join('\n')}

## Preguntas recomendadas (${report.questions.filter(q => q.categoria === 'RECOMENDADA').length})

${report.questions.filter(q => q.categoria === 'RECOMENDADA').map((q, i) => `### R${i + 1}. ${q.id}

**Pregunta:** ${q.pregunta}

- **Por qué importa:** ${q.por_que_importa}
- **Relación con el plan:** ${q.relacion_con_plan}
- **Ejemplo de respuesta:** ${q.placeholder_ejemplo_respuesta}
`).join('\n')}

## Importante

Este es un audit **retroactivo / educativo**. Algunos hallazgos pueden estar
ya resueltos en el plan actual (que continuó después de este cierre con
ajustes del Paso 2). El usuario debe distinguir manualmente cuáles siguen
vigentes.

Para procesarlos visualmente: navegá a /planes-estrategicos/${PLAN_ID}/cierre/1 —
Pantalla 3 va a mostrar todos los hallazgos con UI normal (aprobar/editar/ignorar/responder)
PERO el footer va a decir "Cerrar — los hallazgos quedan registrados" en lugar
de "Procesar todos los cambios y avanzar". Las decisiones se persisten para
auditoría pero no modifican el plan curado.
`

  fs.writeFileSync(outMd, md)

  console.log('\n' + '═'.repeat(72))
  console.log('AUDIT BLOQUE 0-1 COMPLETADO')
  console.log('═'.repeat(72))
  console.log(`\nReportes guardados:`)
  console.log(`  ${outMd}`)
  console.log(`  ${outJson}`)
  console.log(`\nPara revisar visualmente los hallazgos en la UI:`)
  console.log(`  http://localhost:3001/planes-estrategicos/${PLAN_ID}/cierre/1`)
  console.log(`\nLa Pantalla 3 va a hidratar este reviewer turno y mostrar UI read-only.`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
