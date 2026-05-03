// POST /api/planes-estrategicos/[id]/audit/[turno_id]/apply
//
// Aplica las decisiones del usuario al plan. Apply splitteado:
//   - Errors aprobados → sustitución determinística por código (no Opus).
//   - Cross-block changes aprobados → NO-OP en Fase 4 (validador enforza vacío
//     para Bloque 1, único bloque auditable hoy). Registrados en decisiones para
//     tracking pero no aplicados al plan vivo.
//   - Questions respondidas → integración semántica vía Opus.
//
// Body: { decisiones: DecisionUsuario[] }
// Devuelve: { ok: true, fields_modified, warnings, apply_metrics }
//
// Estado: requiere `auditoria_completa`. Transiciona a `esperando_aprobacion_final`
// (Pantalla 4) tras éxito. En falla, rollback a `auditoria_completa` para que el
// user pueda reintentar el procesamiento.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  getReviewerTurnos,
  updatePlanEstrategico,
  updateReviewerDecisionesAndApply,
  updateSubEstadoPaso,
} from '@/lib/airtable'
import { splitDecisiones, applyErrorsDeterministicamente } from '@/lib/audit-apply'
import { buildApplySystemPrompt, buildApplyUserMessage } from '@/lib/apply-prompt'
import type { DecisionUsuario, PlanEstrategico, PropositorPE, SituacionPE } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Pricing de claude-opus-4-7 ($15/M input, $75/M output) para tracking de costo.
const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; turno_id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId, turno_id: turnoId } = await params
  const body = await req.json().catch(() => null) as { decisiones?: DecisionUsuario[] } | null
  if (!body || !Array.isArray(body.decisiones)) {
    return NextResponse.json({ error: 'body.decisiones debe ser array' }, { status: 400 })
  }

  // ── Cargar plan + entrevista + reviewer turn ──
  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  // Validar estado.
  const sub = entrevista.sub_estado_paso ?? 'en_curso'
  if (sub !== 'auditoria_completa') {
    return NextResponse.json({
      error: `sub_estado_paso debe ser 'auditoria_completa' para aplicar, es '${sub}'`,
    }, { status: 409 })
  }

  // Buscar turno reviewer en pasos 1 y 2.
  const [revPaso1, revPaso2] = await Promise.all([
    getReviewerTurnos(entrevista.id, 1),
    getReviewerTurnos(entrevista.id, 2),
  ])
  const reviewer = [...revPaso1, ...revPaso2].find(r => r.airtableId === turnoId)
  if (!reviewer) return NextResponse.json({ error: 'Turno reviewer no encontrado' }, { status: 404 })

  const paso = revPaso1.some(r => r.airtableId === turnoId) ? 1 : 2

  // Snapshot pre-apply: estado del plan ANTES de aplicar (para rollback).
  const snapshotPreApply = {
    proposito: plan.proposito ? JSON.parse(JSON.stringify(plan.proposito)) as PropositorPE : undefined,
    situacion: plan.situacion ? JSON.parse(JSON.stringify(plan.situacion)) as SituacionPE : undefined,
    datos_faltantes: [...(plan.datos_faltantes ?? [])],
  }

  // Transicionar a aplicando_cambios.
  try {
    await updateSubEstadoPaso(entrevista.id, 'auditoria_completa', 'aplicando_cambios')
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'transición rechazada',
    }, { status: 409 })
  }

  // ── Split de decisiones por tipo ──
  const split = splitDecisiones(body.decisiones, reviewer.report)
  console.log('[audit/apply]', JSON.stringify({
    event: 'apply_started',
    plan_id: planId,
    paso,
    errors_aprobados: split.errorsAprobados.length,
    questions_respondidas: split.questionsRespondidas.length,
    cross_block_aprobados: split.crossBlockAprobados.length,
    ignorados: split.ignorados,
  }))

  try {
    // ── 1. Apply de errors deterministicamente ──
    const applyResult = applyErrorsDeterministicamente(plan, split.errorsAprobados)
    let planTrabajado = applyResult.planActualizado
    const fieldsModificados = [...applyResult.fieldsModificados]
    const warnings = [...applyResult.warnings]

    // Cross-block changes: NO-OP en Fase 4. Solo registramos para tracking.
    if (split.crossBlockAprobados.length > 0) {
      warnings.push(
        `${split.crossBlockAprobados.length} cross-block change(s) aprobado(s) NO se aplicaron — feature pendiente. ` +
        `Quedan registrados en Reviewer Decisiones JSON para auditoría futura.`,
      )
    }

    // ── 2. Apply de questions respondidas vía Opus ──
    let opusCost = 0
    let opusLatency = 0

    if (split.questionsRespondidas.length > 0) {
      const systemPrompt = buildApplySystemPrompt()
      const userMessage = buildApplyUserMessage({
        bloque: paso,
        planActual: planTrabajado,
        questionsRespondidas: split.questionsRespondidas,
      })

      const start = Date.now()
      const resp = await anthropic.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      opusLatency = Date.now() - start

      const inputTokens = resp.usage.input_tokens
      const outputTokens = resp.usage.output_tokens
      opusCost = (inputTokens * OPUS_INPUT_PER_M + outputTokens * OPUS_OUTPUT_PER_M) / 1_000_000

      const text = resp.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map(c => c.text)
        .join('\n')

      // Parsear el JSON output. Intento extraer entre llaves si Opus le mete texto extra.
      let parsed: any
      try {
        parsed = JSON.parse(text)
      } catch {
        // Fallback: extraer primer JSON object del texto.
        const m = text.match(/\{[\s\S]*\}/)
        if (m) {
          try { parsed = JSON.parse(m[0]) } catch { /* fall-through */ }
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        // Rollback: el output de Opus fue inválido, no actualizamos el plan.
        await updateSubEstadoPaso(entrevista.id, 'aplicando_cambios', 'auditoria_completa').catch(() => undefined)
        return NextResponse.json({
          error: 'Opus devolvió output no parseable. No se aplicaron las respuestas a preguntas.',
          opus_response_preview: text.slice(0, 500),
          apply_metrics: { costo_usd: opusCost, latencia_ms: opusLatency },
        }, { status: 500 })
      }

      // Validación shallow: debe tener proposito, situacion, datos_faltantes.
      if (!parsed.proposito || !parsed.situacion || !Array.isArray(parsed.datos_faltantes)) {
        await updateSubEstadoPaso(entrevista.id, 'aplicando_cambios', 'auditoria_completa').catch(() => undefined)
        return NextResponse.json({
          error: 'Output de Opus no cumple el shape esperado (proposito + situacion + datos_faltantes).',
          apply_metrics: { costo_usd: opusCost, latencia_ms: opusLatency },
        }, { status: 500 })
      }

      // Aplicar el output de Opus al plan.
      planTrabajado = {
        ...planTrabajado,
        proposito: parsed.proposito as PropositorPE,
        situacion: parsed.situacion as SituacionPE,
        datos_faltantes: parsed.datos_faltantes as string[],
      }
      fieldsModificados.push(`(opus) ${split.questionsRespondidas.length} questions integrated`)
    }

    // ── 3. Persistir plan actualizado ──
    await updatePlanEstrategico(planId, {
      proposito: planTrabajado.proposito,
      situacion: planTrabajado.situacion,
      datos_faltantes: planTrabajado.datos_faltantes,
      ...(planTrabajado.proposito?.horizonte ? { horizonte: planTrabajado.proposito.horizonte } : {}),
    })

    // ── 4. Persistir decisiones + snapshot pre-apply + apply metrics ──
    await updateReviewerDecisionesAndApply(
      turnoId,
      body.decisiones,
      snapshotPreApply,
      { costo_usd: opusCost, latencia_ms: opusLatency },
    )

    // ── 5. Transicionar a esperando_aprobacion_final ──
    await updateSubEstadoPaso(entrevista.id, 'aplicando_cambios', 'esperando_aprobacion_final')

    console.log('[audit/apply]', JSON.stringify({
      event: 'apply_completed',
      plan_id: planId,
      paso,
      errors_aplicados: applyResult.errorsAplicados,
      errors_no_encontrados: applyResult.errorsNoEncontrados,
      fields_modificados: fieldsModificados.length,
      questions_integradas: split.questionsRespondidas.length,
      opus_cost_usd: opusCost,
      opus_latency_ms: opusLatency,
      warnings: warnings.length,
    }))

    return NextResponse.json({
      ok: true,
      fields_modified: fieldsModificados,
      warnings,
      apply_metrics: {
        costo_usd: opusCost,
        latencia_ms: opusLatency,
        errors_aplicados: applyResult.errorsAplicados,
        errors_no_encontrados: applyResult.errorsNoEncontrados,
        questions_integradas: split.questionsRespondidas.length,
        cross_block_no_aplicados: split.crossBlockAprobados.length,
      },
      redirect: `/planes-estrategicos/${planId}/cierre/${paso}/final`,
    })
  } catch (err) {
    console.error('[audit/apply] Error inesperado:', err)
    // Rollback: volver a auditoria_completa.
    await updateSubEstadoPaso(entrevista.id, 'aplicando_cambios', 'auditoria_completa').catch(() => undefined)
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
