// GET/POST /api/planes-estrategicos/[id]/admin/aplicar-cross-block-pendientes
//
// Escape hatch: aplica los cross-block changes APROBADOS que quedaron sin
// efecto en el audit-apply original (cuando el feature era NO-OP). Usa la
// función applyCrossBlockChanges nueva — mismo motor que ahora corre
// automáticamente en el apply normal.
//
// GET → devuelve lista de cross-block pendientes con texto previo y texto
//       final que se aplicaría. Para preview en la página admin.
// POST → ejecuta el apply. Persiste el plan + warnings retroactivos.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  getReviewerTurnos,
  updatePlanEstrategico,
} from '@/lib/airtable'
import { applyCrossBlockChanges } from '@/lib/audit-apply'
import type { ReviewerCrossBlock, DecisionUsuario } from '@/lib/types'

// Helper compartido: encuentra el último reviewer turno con cross-block
// aprobados pendientes de aplicar.
async function loadCrossBlockAprobados(
  planId: string,
  paso: number,
): Promise<
  | { ok: true; turnoId: string; cbcAprobados: Array<{ cbc: ReviewerCrossBlock; decision: DecisionUsuario }> }
  | { ok: false; error: string; status: number }
> {
  const entrevista = await getEntrevistaPE(planId).catch(() => null)
  if (!entrevista) return { ok: false, error: 'Entrevista no encontrada', status: 404 }

  const turnos = await getReviewerTurnos(entrevista.id, paso).catch(() => [])
  if (turnos.length === 0) {
    return { ok: false, error: `No hay reviewer turnos para Paso ${paso}.`, status: 404 }
  }

  // Tomamos el ÚLTIMO turno con decisiones — asumimos que es el procesado.
  const ultimoConDecisiones = [...turnos].reverse().find(t => Array.isArray(t.decisiones) && t.decisiones.length > 0)
  if (!ultimoConDecisiones) {
    return { ok: false, error: 'No hay reviewer turno con decisiones procesadas.', status: 404 }
  }

  const report = ultimoConDecisiones.report
  const decisiones = ultimoConDecisiones.decisiones ?? []

  const decByHallazgo = new Map(decisiones.map(d => [d.hallazgo_id, d]))
  const cbcAprobados: Array<{ cbc: ReviewerCrossBlock; decision: DecisionUsuario }> = []
  for (const cbc of report.cross_block_changes ?? []) {
    const d = decByHallazgo.get(cbc.id)
    if (!d) continue
    if (d.decision === 'aprobado' || d.decision === 'aprobado_con_cambios') {
      cbcAprobados.push({ cbc, decision: d })
    }
  }

  return { ok: true, turnoId: ultimoConDecisiones.airtableId, cbcAprobados }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id: planId } = await params

  const res = await loadCrossBlockAprobados(planId, 3)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })

  return NextResponse.json({
    ok: true,
    turno_id: res.turnoId,
    cross_block_aprobados: res.cbcAprobados.map(({ cbc, decision }) => ({
      id: cbc.id,
      bloque_afectado: cbc.bloque_afectado,
      seccion_afectada: cbc.seccion_afectada,
      severidad: cbc.severidad,
      que_dice_actualmente: cbc.que_dice_actualmente,
      texto_a_aplicar: decision.decision === 'aprobado_con_cambios' && decision.texto_editado
        ? decision.texto_editado
        : cbc.cambio_propuesto,
      fue_editado_por_user: decision.decision === 'aprobado_con_cambios',
    })),
  })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const { id: planId } = await params

    console.log('[admin/aplicar-cross-block] start', JSON.stringify({ plan_id: planId }))

    const res = await loadCrossBlockAprobados(planId, 3)
    if (!res.ok) {
      console.error('[admin/aplicar-cross-block] loadCrossBlockAprobados failed:', res.error)
      return NextResponse.json({ error: res.error }, { status: res.status })
    }
    console.log(`[admin/aplicar-cross-block] cross-block aprobados encontrados: ${res.cbcAprobados.length}`)
    if (res.cbcAprobados.length === 0) {
      return NextResponse.json({
        ok: true,
        mensaje: 'No hay cross-block changes aprobados pendientes de aplicar.',
        crossBlockAplicados: 0,
      })
    }

    const plan = await getPlanEstrategico(planId).catch((e) => {
      console.error('[admin/aplicar-cross-block] getPlanEstrategico failed:', e)
      return null
    })
    if (!plan) return NextResponse.json({ error: 'Plan no encontrado o falló al leer.' }, { status: 404 })

    const entrevista = await getEntrevistaPE(planId).catch(() => null)
    console.log('[admin/aplicar-cross-block] aplicando cross-block changes…')
    const result = applyCrossBlockChanges(plan, res.cbcAprobados, {
      paso_origen: entrevista?.paso_actual ?? 3,
      sub_bloque_origen: entrevista?.sub_bloque_actual ?? '3.E',
    })
    console.log(`[admin/aplicar-cross-block] apply result: aplicados=${result.crossBlockAplicados}, no_encontrados=${result.crossBlockNoEncontrados}, warnings_retroactivos=${result.warningsRetroactivosCreados}, warnings=${result.warnings.length}`)

    // Persistir: el plan resultante incluye proposito/situacion mutados +
    // warnings_retroactivos appendados.
    try {
      await updatePlanEstrategico(planId, {
        proposito: result.planActualizado.proposito,
        situacion: result.planActualizado.situacion,
        plan: result.planActualizado.plan,
      })
      console.log('[admin/aplicar-cross-block] updatePlanEstrategico OK')
    } catch (e) {
      const errAny = e as any
      console.error('[admin/aplicar-cross-block] updatePlanEstrategico failed:', errAny?.message)
      console.error('[admin/aplicar-cross-block] stack:', errAny?.stack)
      return NextResponse.json({
        error: `Error persistiendo a Airtable: ${errAny?.message ?? String(e)}`,
        hint: 'Mirá los logs del servidor para más detalle.',
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      crossBlockAplicados: result.crossBlockAplicados,
      crossBlockNoEncontrados: result.crossBlockNoEncontrados,
      warningsRetroactivosCreados: result.warningsRetroactivosCreados,
      fieldsModificados: result.fieldsModificados,
      warnings: result.warnings,
    })
  } catch (err) {
    const errAny = err as any
    console.error('[admin/aplicar-cross-block] UNCAUGHT:', errAny?.message)
    console.error('[admin/aplicar-cross-block] stack:', errAny?.stack)
    return NextResponse.json({
      error: `Error interno: ${errAny?.message ?? String(err)}`,
      hint: 'Mirá los logs del servidor (terminal del npm run dev) para el stack trace completo.',
    }, { status: 500 })
  }
}
