// Smoke real end-to-end — feat/audit-reviewer.
//
// Orquesta el flow completo SOBRE el plan dummy `recEsoKMENVQI8NUb`:
//   1. Reset estado (esperando_auditoria, sin reviewer turn).
//   2. Llamada real a OpenAI gpt-5.5 (audit). ~$0.50 USD.
//   3. Validación strict del report.
//   4. Persistencia del turno reviewer + transición a auditoria_completa.
//   5. Decisiones mock (aprobar 1 error + responder 1 pregunta crítica).
//   6. Apply: errors deterministico + Opus para integrar respuesta. ~$0.30 USD.
//   7. Persistencia del plan modificado + decisiones + snapshot pre-apply.
//   8. Transición a esperando_aprobacion_final.
//
// NO ejecuta /cerrar-paso-final — eso lo deja al user para verificar manualmente
// la Pantalla 4 + click "Aceptar" + ver wizard Paso 2.
//
// Verifica al final el estado consistente en Airtable.
//
// Costo total estimado: $0.80-1.30 USD.

import {
  getPlanEstrategico,
  getEntrevistaPE,
  getTurnosPE,
  getReviewerTurnos,
  appendReviewerTurno,
  appendTurnosPE,
  updateSubEstadoPaso,
  incrementAuditoriasPaso,
  updatePlanEstrategico,
  updateReviewerDecisionesAndApply,
  updateEntrevistaPE,
} from '@/lib/airtable'
import { callReviewer } from '@/lib/openai-client'
import { buildReviewerSystemPrompt, buildReviewerUserMessage } from '@/lib/reviewer-prompt'
import { validateReviewerReport, REVIEWER_REPORT_SCHEMA } from '@/lib/reviewer-validator'
import { splitDecisiones, applyErrorsDeterministicamente } from '@/lib/audit-apply'
import { buildApplySystemPrompt, buildApplyUserMessage } from '@/lib/apply-prompt'
import Anthropic from '@anthropic-ai/sdk'
import type { DecisionUsuario, PlanEstrategico, PropositorPE, SituacionPE, TurnoPE } from '@/lib/types'

const PLAN_ID: string = 'recEsoKMENVQI8NUb'  // plan dummy de testing
const PLAN_SR_TERRAVINCI = 'recFMWxoE5gTQQrf7'  // BLOQUEADO

const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

// Block list runtime — defensa contra cambio accidental de PLAN_ID.
if (PLAN_ID === PLAN_SR_TERRAVINCI) {
  console.error('FATAL: refuse to operate on Plan Sr de Terravinci.')
  process.exit(1)
}

function step(n: number, msg: string) {
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`Step ${n}: ${msg}`)
  console.log('═'.repeat(72))
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function main() {
  console.log('═'.repeat(72))
  console.log('SMOKE REAL END-TO-END — feat/audit-reviewer')
  console.log(`Plan dummy: ${PLAN_ID}`)
  console.log('═'.repeat(72))

  // ── Step 0: Cargar plan + entrevista ──
  step(0, 'Cargar plan + entrevista')
  const plan = await getPlanEstrategico(PLAN_ID)
  const entrevista = await getEntrevistaPE(PLAN_ID)
  if (!entrevista) throw new Error('Entrevista no encontrada')
  console.log(`  Plan: ${plan.nombre}`)
  console.log(`  Entrevista: ${entrevista.id}`)
  console.log(`  Estado actual: sub_estado_paso=${entrevista.sub_estado_paso}, paso=${entrevista.paso_actual}`)

  // ── Step 1: Reset estado a esperando_auditoria ──
  step(1, 'Reset estado a esperando_auditoria')
  await updateEntrevistaPE(entrevista.id, {
    sub_estado_paso: 'esperando_auditoria',
    paso_actual: 1,
    auditorias_paso_1_count: 0,
  })
  // Restaurar el propósito mock original (sin cambios aplicados de un seed previo).
  await updatePlanEstrategico(PLAN_ID, {
    proposito: {
      escena: 'Transformar el área de testing en motor de validación robusto, capaz de validar las 4 pantallas del audit-reviewer end-to-end con mocks deterministicos.',
      metricas: [
        { metrica: 'Pantallas validadas', valor_objetivo: '4 de 4', valor_actual: '0' },
        { metrica: 'Cobertura de bugs visuales', valor_objetivo: '100%', valor_actual: '' },
      ],
      fuera: [{ item: 'Validación de OpenAI integration', razon: 'es Fase 4 smoke real' }],
      horizonte: 'Fin 2026 (mock)',
      estabilidad: 'Estable durante la Fase 3.',
    },
  })
  console.log('  ✔ Estado reseteado: esperando_auditoria, propósito original restaurado')

  // Recargar para tener estado fresco.
  const planFresh = await getPlanEstrategico(PLAN_ID)
  const entrevistaFresh = await getEntrevistaPE(PLAN_ID)
  if (!entrevistaFresh) throw new Error('Entrevista no encontrada en reload')

  // ── Step 2: Cargar turnos del Bloque 0+1 + serializar resumen ──
  step(2, 'Cargar turnos del Bloque 0+1 + serializar resumen del paso')
  const allTurnos = await getTurnosPE(entrevistaFresh.id)
  const turnosBloque1 = allTurnos.filter(t => t.paso <= 1 && (t.rol === 'user' || t.rol === 'model'))
  console.log(`  Turnos del Bloque 0+1: ${turnosBloque1.length}`)
  if (turnosBloque1.length === 0) throw new Error('No hay turnos en el Bloque 0+1 — ¿se corrió el seed?')

  // Serializar resumen del Paso 1 (similar a serializeResumenPaso del endpoint /audit/start).
  const propMock = planFresh.proposito
  const resumenMd = `## Encuadre

- **Tipo de plan:** ${planFresh.tipo}
- **Área:** ${planFresh.area}
- **Nombre:** ${planFresh.nombre}
- **Horizonte:** ${planFresh.horizonte}

## Propósito

### Lugar de llegada

${propMock?.escena}

### Métricas (${propMock?.metricas?.length ?? 0})

${(propMock?.metricas ?? []).map((m, i) => `${i + 1}. **${m.metrica}** — objetivo: ${m.valor_objetivo}${m.valor_actual ? ` · actual: ${m.valor_actual}` : ''}`).join('\n')}

### Fuera de scope (${propMock?.fuera?.length ?? 0})

${(propMock?.fuera ?? []).map(f => `- **${f.item}** — razón: ${f.razon}`).join('\n')}

### Horizonte

${propMock?.horizonte}

### Estabilidad

${propMock?.estabilidad}`
  console.log(`  Resumen serializado: ${resumenMd.length} chars`)

  // ── Step 3: Transicionar a auditoria_en_proceso ──
  step(3, 'Transicionar a auditoria_en_proceso')
  await updateSubEstadoPaso(entrevistaFresh.id, 'esperando_auditoria', 'auditoria_en_proceso')
  console.log('  ✔ Estado: auditoria_en_proceso')

  // ── Step 4: Llamada REAL a gpt-5.5 (audit) ──
  step(4, 'Llamada REAL a gpt-5.5 (effort=high) — audit del Bloque 0+1')
  console.log('  Esto puede tardar 200-270s (latencia baseline de gpt-5.5 effort=high).')
  console.log('  Esperando...')

  const reviewerSystem = buildReviewerSystemPrompt(1)
  const reviewerUser = buildReviewerUserMessage({
    bloque: 1,
    turnos: turnosBloque1,
    resumenEstructurado: resumenMd,
  })
  const reviewerResult = await callReviewer({
    systemPrompt: reviewerSystem,
    userMessage: reviewerUser,
    schema: REVIEWER_REPORT_SCHEMA as unknown as Record<string, unknown>,
    schemaName: 'reviewer_report',
    maxOutputTokens: 16000,
    onProgress: (ms) => process.stdout.write(`  ⏱  ${(ms / 1000).toFixed(0)}s...\r`),
  })
  console.log('')

  if (!reviewerResult.ok) {
    console.error(`  ❌ FAIL: callReviewer reason=${reviewerResult.reason}`)
    console.error(`  Detalle: ${reviewerResult.details}`)
    console.error(`  Métricas: ${JSON.stringify(reviewerResult.metrics)}`)
    await updateSubEstadoPaso(entrevistaFresh.id, 'auditoria_en_proceso', 'esperando_auditoria').catch(() => undefined)
    process.exit(1)
  }
  console.log(`  ✔ Reviewer respondió en ${(reviewerResult.metrics.latency_ms / 1000).toFixed(1)}s`)
  console.log(`  Métricas: input=${reviewerResult.metrics.input_tokens}, output=${reviewerResult.metrics.output_tokens} (reasoning=${reviewerResult.metrics.reasoning_tokens})`)
  console.log(`  Costo: $${reviewerResult.metrics.cost_usd.toFixed(3)} USD`)

  // ── Step 5: Validar shape ──
  step(5, 'Validar shape del report')
  const validation = validateReviewerReport(reviewerResult.data, 1)
  if (!validation.ok) {
    console.error(`  ❌ FAIL: validation rejected. Errors:`)
    for (const e of validation.errors.slice(0, 5)) console.error(`    - ${e}`)
    await updateSubEstadoPaso(entrevistaFresh.id, 'auditoria_en_proceso', 'esperando_auditoria').catch(() => undefined)
    process.exit(1)
  }
  const report = validation.data
  console.log(`  ✔ Report válido: ${report.errors.length} errors, ${report.questions.length} preguntas, confianza=${report.meta.confianza_general}`)

  // ── Step 6: Persistir turno reviewer + counter + transición ──
  step(6, 'Persistir turno reviewer + counter + transición a auditoria_completa')
  const reviewerTurno = await appendReviewerTurno(entrevistaFresh.id, allTurnos.length, {
    paso: 1,
    bloqueAuditado: 1,
    modelo: reviewerResult.metrics.model,
    report,
    costo_usd: reviewerResult.metrics.cost_usd,
    latencia_ms: reviewerResult.metrics.latency_ms,
    retry_count: reviewerResult.metrics.retries_used,
  })
  await incrementAuditoriasPaso(entrevistaFresh.id, 1, 0)
  await updateSubEstadoPaso(entrevistaFresh.id, 'auditoria_en_proceso', 'auditoria_completa')
  console.log(`  ✔ Reviewer turno: ${reviewerTurno.id}, counter=1, estado=auditoria_completa`)

  // ── Step 7: Decisiones mock ──
  step(7, 'Decisiones mock (aprobar 1er error + responder 1ra pregunta crítica)')
  const decisiones: DecisionUsuario[] = []
  if (report.errors.length > 0) {
    const e = report.errors[0]
    decisiones.push({ hallazgo_id: e.id, tipo: 'error', decision: 'aprobado' })
    console.log(`  ✔ Aprobando error: ${e.id} [${e.severidad}] — "${e.que_dice_resumen.slice(0, 60)}..."`)
    if (report.errors.length > 1) {
      const e2 = report.errors[1]
      decisiones.push({ hallazgo_id: e2.id, tipo: 'error', decision: 'ignorado' })
      console.log(`  ✔ Ignorando error: ${e2.id}`)
    }
  } else {
    console.log('  ⚠ Reviewer no encontró errors. Smoke continúa con preguntas only.')
  }
  const preguntaCrit = report.questions.find(q => q.categoria === 'CRITICA') ?? report.questions[0]
  if (preguntaCrit) {
    decisiones.push({
      hallazgo_id: preguntaCrit.id,
      tipo: 'pregunta',
      decision: 'respondido',
      respuesta_usuario: 'Respuesta mock generada por el smoke end-to-end de Fase 4. Esta respuesta debería ser integrada por Opus al campo correspondiente del resumen (típicamente datos_faltantes o métricas).',
    })
    console.log(`  ✔ Respondiendo pregunta: ${preguntaCrit.id} [${preguntaCrit.categoria}]`)
  }
  // Ignorar resto.
  for (const q of report.questions) {
    if (decisiones.some(d => d.hallazgo_id === q.id)) continue
    decisiones.push({ hallazgo_id: q.id, tipo: 'pregunta', decision: 'ignorado' })
  }
  console.log(`  Total decisiones: ${decisiones.length}`)

  // ── Step 8: Snapshot pre-apply + transición a aplicando_cambios ──
  step(8, 'Snapshot pre-apply + transición a aplicando_cambios')
  const snapshotPreApply = {
    proposito: planFresh.proposito ? JSON.parse(JSON.stringify(planFresh.proposito)) as PropositorPE : undefined,
    situacion: planFresh.situacion ? JSON.parse(JSON.stringify(planFresh.situacion)) as SituacionPE : undefined,
    datos_faltantes: [...(planFresh.datos_faltantes ?? [])],
  }
  await updateSubEstadoPaso(entrevistaFresh.id, 'auditoria_completa', 'aplicando_cambios')
  console.log('  ✔ Estado: aplicando_cambios. Snapshot pre-apply capturado.')

  // ── Step 9: Apply splitteado ──
  step(9, 'Apply splitteado (errors det + Opus para preguntas)')
  const split = splitDecisiones(decisiones, report)
  console.log(`  Split: ${split.errorsAprobados.length} errors aprobados, ${split.questionsRespondidas.length} preguntas respondidas, ${split.crossBlockAprobados.length} cross-block, ${split.ignorados} ignorados`)

  const applyRes = applyErrorsDeterministicamente(planFresh, split.errorsAprobados)
  console.log(`  Errors aplicados: ${applyRes.errorsAplicados}, no encontrados: ${applyRes.errorsNoEncontrados}`)
  if (applyRes.warnings.length > 0) {
    console.log('  ⚠ Warnings:')
    for (const w of applyRes.warnings) console.log(`    - ${w}`)
  }
  console.log(`  Fields modificados por errors: ${applyRes.fieldsModificados.join(', ') || '(ninguno)'}`)
  let planTrabajado = applyRes.planActualizado

  let applyCost = 0
  let applyLatency = 0
  if (split.questionsRespondidas.length > 0) {
    console.log('  Llamando a Opus (streaming) para integrar respuesta...')
    const opusStart = Date.now()
    // Streaming required: SDK Anthropic rechaza non-streaming si max_tokens >
    // umbral que sugeriría >10min de runtime. Con 32k + Opus reasoning entra
    // en ese rango.
    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 32000,
      system: buildApplySystemPrompt(),
      messages: [{ role: 'user', content: buildApplyUserMessage({
        bloque: 1, planActual: planTrabajado, questionsRespondidas: split.questionsRespondidas,
      }) }],
    })
    const finalMsg = await stream.finalMessage()
    applyLatency = Date.now() - opusStart
    applyCost = (finalMsg.usage.input_tokens * OPUS_INPUT_PER_M + finalMsg.usage.output_tokens * OPUS_OUTPUT_PER_M) / 1_000_000
    const text = finalMsg.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text)
      .join('\n')
    let parsed: any
    try { parsed = JSON.parse(text) } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (m) try { parsed = JSON.parse(m[0]) } catch { /* */ }
    }
    if (!parsed || typeof parsed !== 'object') {
      console.error('  ❌ FAIL: Opus output no parseable')
      console.error(`  Preview: ${text.slice(0, 500)}`)
      await updateSubEstadoPaso(entrevistaFresh.id, 'aplicando_cambios', 'auditoria_completa').catch(() => undefined)
      process.exit(1)
    }
    // Patch semantics: solo mergeamos las keys top-level que Opus emitió.
    // Si una key no viene, mantenemos el valor anterior intacto.
    planTrabajado = {
      ...planTrabajado,
      ...(parsed.proposito ? { proposito: parsed.proposito as PropositorPE } : {}),
      ...(parsed.situacion ? { situacion: parsed.situacion as SituacionPE } : {}),
      ...(Array.isArray(parsed.datos_faltantes) ? { datos_faltantes: parsed.datos_faltantes as string[] } : {}),
    }
    const keysEmitidas = Object.keys(parsed)
    console.log(`  ✔ Opus integró respuesta en ${(applyLatency / 1000).toFixed(1)}s, $${applyCost.toFixed(3)}`)
    console.log(`  Keys emitidas: ${keysEmitidas.length === 0 ? '(ninguna — sin cambios)' : keysEmitidas.join(', ')}`)
  }

  // ── Step 10: Persistir plan modificado + decisiones + transición ──
  step(10, 'Persistir plan modificado + decisiones + transición a esperando_aprobacion_final')
  await updatePlanEstrategico(PLAN_ID, {
    proposito: planTrabajado.proposito,
    situacion: planTrabajado.situacion,
    datos_faltantes: planTrabajado.datos_faltantes,
    ...(planTrabajado.proposito?.horizonte ? { horizonte: planTrabajado.proposito.horizonte } : {}),
  })
  await updateReviewerDecisionesAndApply(reviewerTurno.id, decisiones, snapshotPreApply, {
    costo_usd: applyCost, latencia_ms: applyLatency,
  })
  await updateSubEstadoPaso(entrevistaFresh.id, 'aplicando_cambios', 'esperando_aprobacion_final')
  console.log('  ✔ Plan actualizado, decisiones+snapshot persistidos, estado=esperando_aprobacion_final')

  // ── Step 11: Verificación de estado consistente ──
  step(11, 'Verificación final del estado en Airtable')
  const planFinal = await getPlanEstrategico(PLAN_ID)
  const entrevistaFinal = await getEntrevistaPE(PLAN_ID)
  if (!entrevistaFinal) throw new Error('Entrevista no encontrada en verificación final')
  const reviewerTurnos = await getReviewerTurnos(entrevistaFinal.id, 1)
  const reviewerFinal = reviewerTurnos.find(r => r.airtableId === reviewerTurno.id)

  console.log(`  sub_estado_paso: ${entrevistaFinal.sub_estado_paso} (esperado: esperando_aprobacion_final)`)
  console.log(`  auditorias_paso_1_count: ${entrevistaFinal.auditorias_paso_1_count} (esperado: 1)`)
  console.log(`  reviewer turno encontrado: ${!!reviewerFinal}`)
  console.log(`  reviewer.snapshotPreApply persistido: ${!!reviewerFinal?.snapshotPreApply}`)
  console.log(`  reviewer.decisiones persistidas: ${reviewerFinal?.decisiones?.length ?? 0}`)
  console.log(`  reviewer.applyCostoUsd: $${reviewerFinal?.applyCostoUsd?.toFixed(3) ?? '0'}`)
  console.log(`  reviewer.applyLatenciaMs: ${reviewerFinal?.applyLatenciaMs}ms`)
  console.log(`  plan.escena cambió: ${planFinal.proposito?.escena !== snapshotPreApply.proposito?.escena}`)

  const totalCost = reviewerResult.metrics.cost_usd + applyCost
  console.log(`\n  Costo total del smoke: $${totalCost.toFixed(3)} USD`)

  // ── Final ──
  console.log('\n' + '═'.repeat(72))
  console.log('SMOKE END-TO-END COMPLETADO ✅')
  console.log('═'.repeat(72))
  console.log(`\nPara verificar visualmente Pantalla 4 con datos REALES:`)
  console.log(`  http://localhost:3001/planes-estrategicos/${PLAN_ID}/cierre/1/final\n`)
  console.log(`Después click "Aceptar y avanzar al Paso 2" → snapshot inmutable + wizard Paso 2.\n`)
  console.log(`Verificá:`)
  console.log(`  1. Pantalla 4 muestra el diff con cambios reales del Opus integrating la respuesta.`)
  console.log(`  2. Click "Aceptar" → redirige al wizard.`)
  console.log(`  3. Wizard arranca en Paso 2 (sub_estado_paso=en_curso, paso_actual=2).`)
  console.log(`  4. Verificá en Airtable: hay turno snapshot con Snapshot Paso=1 + Snapshot Resumen JSON.`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
