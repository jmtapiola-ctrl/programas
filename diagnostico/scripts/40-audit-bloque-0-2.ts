// Audit del Bloque 0-2 (Encuadre + Propósito + Situación) del Plan Sr de
// Terravinci. Modo VIA_SCRIPT (NO read_only — el resumen actual matchea el
// estado del plan vivo, los hallazgos pueden aplicarse después si el user
// los procesa desde Pantalla 3).
//
// Material auditado:
//   - Conversación: turnos 1-106 del Airtable (cierre conceptual del Paso 2
//     en turno 106: "Paso 2 cerrado. ENTREVISTA BLOQUE 0-1-2 COMPLETADA").
//   - Resumen: serializado del estado actual del plan en Airtable (refleja
//     todos los ajustes del cierre Paso 2 que ya están aplicados).
//
// Resultado:
//   - Reviewer turn persistido con read_only=false + via_script=true.
//   - Sub_estado_paso transiciona a auditoria_completa (paso 2 puede entrar al
//     flow de apply normal desde Pantalla 3 si el user lo decide).
//   - Auditorias Paso 2 Count se incrementa.
//
// Costo esperado: $0.80-2.00 USD (input mayor que Bloque 0-1 — turnos 1-106 en
// vez de 1-44, latencia probablemente 300-450s).
//
// IMPORTANTE: para este audit se ejecuta vía script porque la latencia
// proyectada (300-450s) excede el cap de 300s de Vercel Pro para serverless.
// En local con npm run dev funciona.
//
// Uso:
//   REVIEWER_TIMEOUT_MS=600000 npx tsx --env-file=.env.local diagnostico/scripts/40-audit-bloque-0-2.ts

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  getTurnosPE,
  getReviewerTurnos,
  appendReviewerTurno,
  incrementAuditoriasPaso,
  updateSubEstadoPaso,
  updateEntrevistaPE,
} from '@/lib/airtable'
import { callReviewer } from '@/lib/openai-client'
import { buildReviewerSystemPrompt, buildReviewerUserMessage } from '@/lib/reviewer-prompt'
import { validateReviewerReport, REVIEWER_REPORT_SCHEMA } from '@/lib/reviewer-validator'
import type { PlanEstrategico } from '@/lib/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PLAN_ID = 'recFMWxoE5gTQQrf7'  // Plan Sr de Terravinci
const CORTE_BLOQUE_0_2 = 106  // turno 106 del Airtable = "Paso 2 cerrado"

// ─── Helper: serializar plan completo (Encuadre + Propósito + Situación) ───
async function serializeResumenBloque0_2(plan: PlanEstrategico): Promise<string> {
  const p = plan.proposito
  const s = plan.situacion

  const metricasList = (p?.metricas ?? []).length > 0
    ? p!.metricas.map((m, i) => `${i + 1}. **${m.metrica}** — objetivo: ${m.valor_objetivo}${m.valor_actual ? ` · actual: ${m.valor_actual}` : ''}`).join('\n')
    : '_(ninguna)_'

  const fueraList = (p?.fuera ?? []).length > 0
    ? p!.fuera.map(f => `- **${f.item}**${f.razon ? ` — razón: ${f.razon}` : ''}`).join('\n')
    : '_(ninguno)_'

  const desviosList = (s?.desvios_secundarios ?? []).length > 0
    ? s!.desvios_secundarios.map(d => `- **${d.descripcion}** — datos: ${d.datos}`).join('\n')
    : '_(ninguno)_'

  const resistenciasList = (s?.resistencias ?? []).length > 0
    ? s!.resistencias.map(r => `- **${r.actor}** [${r.tipo} · criticidad ${r.criticidad}] — ${r.descripcion}${r.mitigacion ? ` · mitigación: ${r.mitigacion}` : ''}`).join('\n')
    : '_(ninguna)_'

  const datosFaltantesList = (plan.datos_faltantes ?? []).length > 0
    ? plan.datos_faltantes.map(d => `- ${d}`).join('\n')
    : '_(ninguno)_'

  return `## Encuadre

- **Tipo de plan:** ${plan.tipo}
- **Área:** ${plan.area || '(no declarada)'}
- **Nombre:** ${plan.nombre}
${plan.horizonte ? `- **Horizonte:** ${plan.horizonte}\n` : ''}

## Propósito

### Lugar de llegada

${p?.escena || '_(no declarado)_'}

### Métricas (${p?.metricas?.length ?? 0})

${metricasList}

### Fuera de scope (${p?.fuera?.length ?? 0})

${fueraList}

### Horizonte

${p?.horizonte || '_(no declarado)_'}

### Estabilidad

${p?.estabilidad || '_(no declarada)_'}

## Situación

### Desvío principal

${s?.desvio_principal || '_(no declarado)_'}

### Cuantificación

${s?.desvio_cuantificado || '_(no cuantificado)_'}

### Desvíos secundarios (${s?.desvios_secundarios?.length ?? 0})

${desviosList}

### Causa raíz

${s?.causa_raiz || '_(no declarada)_'}

### Consecuencias de no actuar

- En 6 meses: ${s?.consecuencia_6m || '_(no declarado)_'}
- En 12 meses: ${s?.consecuencia_12m || '_(no declarado)_'}

### Recursos actuales

${s?.recursos_actuales || '_(no declarado)_'}

### Recursos faltantes

${s?.recursos_faltantes || '_(no declarado)_'}

### Intentos previos

${s?.intentos_previos || '_(no declarado)_'}

### Resistencias y amenazas (${s?.resistencias?.length ?? 0})

${resistenciasList}

## Datos por conseguir (${plan.datos_faltantes?.length ?? 0})

${datosFaltantesList}
`
}

async function main() {
  console.log('═'.repeat(72))
  console.log('AUDIT — Bloque 0-2 del Plan Sr de Terravinci')
  console.log('Modo: VIA_SCRIPT (latencia esperada > 300s, no entra en Vercel Pro)')
  console.log('═'.repeat(72))

  // ── Cargar plan + entrevista + turnos ──
  const plan = await getPlanEstrategico(PLAN_ID)
  const entrevista = await getEntrevistaPE(PLAN_ID)
  if (!entrevista) throw new Error('Entrevista no encontrada')
  console.log(`\nPlan: ${plan.nombre}`)
  console.log(`Entrevista: ${entrevista.id}`)

  const allTurnos = await getTurnosPE(entrevista.id)
  console.log(`Turnos totales en Airtable: ${allTurnos.length}`)

  const turnosBloque = allTurnos.slice(0, CORTE_BLOQUE_0_2).filter(t => t.rol === 'user' || t.rol === 'model')
  console.log(`Corte aplicado: turnos 1..${CORTE_BLOQUE_0_2}`)
  console.log(`Turnos del Bloque 0-2 (user|model): ${turnosBloque.length}`)

  // Validación: el turno 106 debe declarar "Paso 2 cerrado".
  const ultimo = allTurnos[CORTE_BLOQUE_0_2 - 1]
  const cierreDeclarado = /paso\s*2.{0,30}(cerrado|completo|terminado)/i.test(ultimo?.contenido ?? '')
  console.log(`Check defensivo del corte: ${cierreDeclarado ? '✅ último turno declara cierre del Paso 2' : '⚠ último turno NO declara cierre — verificá manualmente'}`)
  if (!cierreDeclarado) {
    console.log(`  Preview turno ${CORTE_BLOQUE_0_2}: "${ultimo?.contenido?.slice(0, 200)}..."`)
  }

  // ── Verificar count de auditorías del Paso 2 ──
  const currentCount = entrevista.auditorias_paso_2_count ?? 0
  if (currentCount >= 3) {
    console.error(`\n❌ Ya se hicieron ${currentCount} auditorías sobre el Paso 2 (max 3).`)
    process.exit(1)
  }

  // ── Cargar audicions previas para contexto en re-audit ──
  const audicionesPrevias = await getReviewerTurnos(entrevista.id, 2)
  console.log(`Auditorías previas del Paso 2: ${audicionesPrevias.length}`)

  // ── Serializar resumen actual del plan ──
  const resumenMd = await serializeResumenBloque0_2(plan)
  console.log(`Resumen del plan actual serializado: ${resumenMd.length.toLocaleString()} chars`)

  // ── Construir prompts (modo NORMAL — NO histórico) ──
  const systemPrompt = buildReviewerSystemPrompt(2, { historicoEducativo: false })
  const userMessage = buildReviewerUserMessage({
    bloque: 2,
    turnos: turnosBloque,
    resumenEstructurado: resumenMd,
    auditoriasPrevias: audicionesPrevias.length > 0
      ? audicionesPrevias.map(a => ({
          report: a.report,
          decisiones: a.decisiones,
          costo_usd: a.costo_usd,
          retry_count: a.retry_count,
        }))
      : undefined,
  })
  console.log(`\nSystem prompt: ${systemPrompt.length.toLocaleString()} chars`)
  console.log(`User message: ${userMessage.length.toLocaleString()} chars`)

  // ── Transición de estado ──
  // Aceptamos los estados desde donde se puede arrancar audit (esperando_auditoria
  // o esperando_aprobacion_final del Paso 2). Si el plan está en otro estado,
  // forzamos transición a esperando_auditoria primero.
  const sub = entrevista.sub_estado_paso ?? 'en_curso'
  if (sub !== 'esperando_auditoria' && sub !== 'esperando_aprobacion_final') {
    console.log(`\nForzando estado sub_estado_paso='esperando_auditoria' (estaba '${sub}')...`)
    await updateEntrevistaPE(entrevista.id, { sub_estado_paso: 'esperando_auditoria' })
  }
  const estadoOrigen = sub === 'esperando_aprobacion_final' ? 'esperando_aprobacion_final' : 'esperando_auditoria'
  await updateSubEstadoPaso(entrevista.id, estadoOrigen, 'auditoria_en_proceso')
  console.log(`Estado: auditoria_en_proceso (origen=${estadoOrigen})`)

  // ── Llamada al reviewer ──
  console.log('\nLlamando a gpt-5.5 (effort=high) — audit del Bloque 0-2...')
  console.log('(Latencia esperada: 300-450s, costo ~$1-2 USD)')

  try {
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
      // Rollback estado.
      await updateSubEstadoPaso(entrevista.id, 'auditoria_en_proceso', estadoOrigen).catch(() => undefined)
      process.exit(1)
    }
    console.log(`✔ Reviewer respondió en ${(result.metrics.latency_ms / 1000).toFixed(1)}s`)
    console.log(`  Tokens: input=${result.metrics.input_tokens.toLocaleString()}, output=${result.metrics.output_tokens.toLocaleString()} (reasoning=${result.metrics.reasoning_tokens.toLocaleString()})`)
    console.log(`  Costo: $${result.metrics.cost_usd.toFixed(3)} USD`)

    // ── Validar shape ──
    const validation = validateReviewerReport(result.data, 2)
    if (!validation.ok) {
      console.error(`\n❌ FAIL: validation rejected. Errors:`)
      for (const e of validation.errors.slice(0, 5)) console.error(`  - ${e}`)
      await updateSubEstadoPaso(entrevista.id, 'auditoria_en_proceso', estadoOrigen).catch(() => undefined)
      process.exit(1)
    }
    const report = validation.data
    console.log(`\nReport válido:`)
    console.log(`  Errors: ${report.errors.length} (Alta=${report.meta.errores_alta} / Media=${report.meta.errores_media} / Baja=${report.meta.errores_baja})`)
    console.log(`  Preguntas críticas: ${report.meta.preguntas_criticas}`)
    console.log(`  Preguntas recomendadas: ${report.meta.preguntas_recomendadas}`)
    console.log(`  Cross-block changes (Bloque 1): ${report.meta.cross_block_changes_total}`)
    console.log(`  Confianza: ${report.meta.confianza_general}`)
    console.log(`  Justificación: ${report.meta.justificacion_confianza}`)

    // ── Persistir + transicionar ──
    console.log('\nPersistiendo turno reviewer (read_only=false, via_script=true)...')
    const reviewerTurno = await appendReviewerTurno(entrevista.id, allTurnos.length, {
      paso: 2,
      bloqueAuditado: 2,
      modelo: result.metrics.model,
      report,
      costo_usd: result.metrics.cost_usd,
      latencia_ms: result.metrics.latency_ms,
      retry_count: result.metrics.retries_used,
      read_only: false,
      via_script: true,
    })
    await incrementAuditoriasPaso(entrevista.id, 2, currentCount)
    await updateSubEstadoPaso(entrevista.id, 'auditoria_en_proceso', 'auditoria_completa')
    console.log(`✔ Turno reviewer creado: ${reviewerTurno.id}`)
    console.log(`  Counter Paso 2: ${currentCount + 1}`)
    console.log(`  Estado: auditoria_completa`)

    // ── Guardar reporte JSON local + MD ──
    const outDir = path.join(ROOT, 'output')
    fs.writeFileSync(path.join(outDir, '40-audit-bloque-0-2.json'), JSON.stringify({
      ran_at: new Date().toISOString(),
      plan_id: PLAN_ID,
      reviewer_turno_id: reviewerTurno.id,
      bloque: '0-2',
      corte: { turnos_desde: 1, turnos_hasta: CORTE_BLOQUE_0_2 },
      metrics: result.metrics,
      report,
    }, null, 2))

    const md = `# Audit Bloque 0-2 — Plan Sr de Terravinci

Fecha: ${new Date().toISOString()}
Reviewer turno: \`${reviewerTurno.id}\`
Modelo: \`${result.metrics.model}\` · effort: \`${result.metrics.effort}\`

## Métricas

- Latencia: ${(result.metrics.latency_ms / 1000).toFixed(1)}s
- Costo: $${result.metrics.cost_usd.toFixed(3)} USD
- Tokens: ${result.metrics.input_tokens.toLocaleString()} input / ${result.metrics.output_tokens.toLocaleString()} output (${result.metrics.reasoning_tokens.toLocaleString()} reasoning)

## Hallazgos

- ${report.errors.length} errores (${report.meta.errores_alta}A · ${report.meta.errores_media}M · ${report.meta.errores_baja}B)
- ${report.meta.preguntas_criticas} preguntas críticas + ${report.meta.preguntas_recomendadas} recomendadas
- ${report.meta.cross_block_changes_total} cross-block changes hacia Bloque 1
- Confianza: ${report.meta.confianza_general}

## Errores

${report.errors.map((e, i) => `### ${i + 1}. [${e.severidad}] ${e.id}
- **Resumen:** ${e.que_dice_resumen}
- **Conversación (turno ${e.turno_referencia}):** ${e.que_se_dijo_en_conversacion}
- **Cambio propuesto:** ${e.cambio_propuesto}
`).join('\n')}

## Preguntas

### Críticas

${report.questions.filter(q => q.categoria === 'CRITICA').map((q, i) => `**C${i + 1}.** ${q.pregunta}
  - Por qué importa: ${q.por_que_importa}
  - Ejemplo: ${q.placeholder_ejemplo_respuesta}
`).join('\n')}

### Recomendadas

${report.questions.filter(q => q.categoria === 'RECOMENDADA').map((q, i) => `**R${i + 1}.** ${q.pregunta}
  - Por qué importa: ${q.por_que_importa}
`).join('\n')}

## Cross-block changes (hacia Bloque 1)

${report.cross_block_changes.length === 0 ? '_(ninguno)_' : report.cross_block_changes.map((c, i) => `### CB${i + 1}. [${c.severidad}] Bloque ${c.bloque_afectado} > ${c.seccion_afectada}
- Actualmente: ${c.que_dice_actualmente}
- Modificado por (turno ${c.turno_referencia}): ${c.que_se_declaro_que_lo_modifica}
- Cambio propuesto: ${c.cambio_propuesto}
`).join('\n')}

## Próximos pasos

Para procesar las decisiones desde la UI:
\`\`\`
http://localhost:3001/planes-estrategicos/${PLAN_ID}/cierre/2
\`\`\`

Pantalla 3 va a hidratar este reviewer turn (read_only=false), permitir
aprobar/editar/ignorar/responder cada hallazgo, y procesar el apply.
`
    fs.writeFileSync(path.join(outDir, '40-audit-bloque-0-2.md'), md)

    console.log('\n' + '═'.repeat(72))
    console.log('AUDIT BLOQUE 0-2 COMPLETADO')
    console.log('═'.repeat(72))
    console.log(`\nReportes guardados:`)
    console.log(`  ${path.join(outDir, '40-audit-bloque-0-2.md')}`)
    console.log(`  ${path.join(outDir, '40-audit-bloque-0-2.json')}`)
    console.log(`\nPara procesar decisiones desde la UI:`)
    console.log(`  http://localhost:3001/planes-estrategicos/${PLAN_ID}/cierre/2`)
  } catch (err) {
    console.error('\n❌ Error inesperado:', err)
    await updateSubEstadoPaso(entrevista.id, 'auditoria_en_proceso', estadoOrigen).catch(() => undefined)
    process.exit(1)
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
