// POST /api/planes-estrategicos/[id]/draft/aplicar-cambios
//
// Aplica los cambios CONFIRMADOS por el usuario al BORRADOR (no al plan vivo).
// El panel izquierdo se re-renderiza desde el borrador actualizado.
//
// Body: { cambios: ReconcileChange[] }
// Response: { ok, draft, aplicados, noEncontrados, warnings }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { getPlanDraft, updatePlanDraft } from '@/lib/airtable'
import { draftComoPlan } from '@/lib/draft-chat-prompt'
import { aplicarReconcileChanges } from '@/lib/reconcile-apply'
import { aplicarMovCambios } from '@/lib/draft-mov-apply'
import { computeSchedule, faseDeFecha, buildFaseDisplayLabel } from '@/lib/computeSchedule'
import type { ReconcileChange, DraftMovCambio } from '@/lib/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const access = await checkPlanAccess(session.user as any, planId)
  if (!access.allowed) return NextResponse.json({ error: access.error ?? 'Sin acceso' }, { status: access.status ?? 403 })

  const body = await req.json().catch(() => ({}))
  const cambios: ReconcileChange[] = Array.isArray(body?.cambios) ? body.cambios : []
  const cambiosInv: DraftMovCambio[] = Array.isArray(body?.cambios_inventario) ? body.cambios_inventario : []
  if (cambios.length === 0 && cambiosInv.length === 0) return NextResponse.json({ error: 'No hay cambios para aplicar.' }, { status: 400 })

  const draft = await getPlanDraft(planId)
  if (!draft) return NextResponse.json({ error: 'No hay borrador.' }, { status: 409 })

  const warnings: string[] = []
  let aplicadosTexto = 0, noEncontrados = 0, fueraDeAlcance = 0
  let aplicadosInv = 0, noAplicadosInv = 0

  // 1. Cambios de texto (proposito/situacion/criterio).
  if (cambios.length > 0) {
    const draftPlan = draftComoPlan(draft)
    const res = aplicarReconcileChanges(draftPlan, cambios)
    draft.proposito = res.planActualizado.proposito
    draft.situacion = res.planActualizado.situacion
    draft.preparativos = res.planActualizado.plan?.preparativos
    const aplicados = cambios.filter(c => !c.fuera_de_alcance)
    draft.cambios_aplicados = [...(draft.cambios_aplicados ?? []), ...aplicados]
    aplicadosTexto = res.aplicados; noEncontrados = res.noEncontrados; fueraDeAlcance = res.fueraDeAlcance
    warnings.push(...res.warnings)
  }

  // 2. Cambios de inventario (movimientos + dependencias).
  if (cambiosInv.length > 0) {
    const r = aplicarMovCambios(draft.inventario, cambiosInv)
    draft.inventario = r.inventario
    draft.cambios_inventario_aplicados = [...(draft.cambios_inventario_aplicados ?? []), ...cambiosInv]
    aplicadosInv = r.aplicados; noAplicadosInv = r.noAplicados
    warnings.push(...r.warnings)
  }

  draft.actualizado_en = new Date().toISOString()
  await updatePlanDraft(planId, draft)

  // Cronograma recomputado (feedback del impacto en el Gantt).
  const cierre = cierreRecomputado(draft.inventario?.movimientos)

  return NextResponse.json({
    ok: true, draft,
    aplicados: aplicadosTexto + aplicadosInv,
    aplicadosTexto, aplicadosInv,
    noEncontrados, fueraDeAlcance, noAplicadosInv,
    warnings, cierre,
  })
}

// Fecha/fase de cierre del cronograma (el mov que termina más tarde) para
// feedback del impacto en el Gantt. Recomputa CPM desde duraciones + deps.
function cierreRecomputado(movs: any[] | undefined): string | null {
  if (!movs?.length) return null
  const sched = computeSchedule(movs as any)
  if (sched.size === 0) return null
  // El cierre = el mov que TERMINA más tarde. La fase se deriva de esa fecha de
  // término (no del arranque) para que el label sea coherente con el YM.
  let latest: { termina: Date; ym: string } | null = null
  for (const s of sched.values()) {
    if (!latest || s.termina.getTime() > latest.termina.getTime()) latest = { termina: s.termina, ym: s.terminaYM }
  }
  if (!latest) return null
  return `${latest.ym} (${buildFaseDisplayLabel(faseDeFecha(latest.termina).key)})`
}
