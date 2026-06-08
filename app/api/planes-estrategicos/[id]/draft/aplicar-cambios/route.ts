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
import type { ReconcileChange } from '@/lib/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const access = await checkPlanAccess(session.user as any, planId)
  if (!access.allowed) return NextResponse.json({ error: access.error ?? 'Sin acceso' }, { status: access.status ?? 403 })

  const body = await req.json().catch(() => ({}))
  const cambios: ReconcileChange[] = Array.isArray(body?.cambios) ? body.cambios : []
  if (cambios.length === 0) return NextResponse.json({ error: 'No hay cambios para aplicar.' }, { status: 400 })

  const draft = await getPlanDraft(planId)
  if (!draft) return NextResponse.json({ error: 'No hay borrador.' }, { status: 409 })

  const draftPlan = draftComoPlan(draft)
  const res = aplicarReconcileChanges(draftPlan, cambios)

  // Volcar los campos editables actualizados de vuelta al borrador.
  draft.proposito = res.planActualizado.proposito
  draft.situacion = res.planActualizado.situacion
  draft.preparativos = res.planActualizado.plan?.preparativos
  // Trail de cambios aplicados (los aplicables, no los fuera de alcance).
  const aplicados = cambios.filter(c => !c.fuera_de_alcance)
  draft.cambios_aplicados = [...(draft.cambios_aplicados ?? []), ...aplicados]
  draft.actualizado_en = new Date().toISOString()
  await updatePlanDraft(planId, draft)

  return NextResponse.json({
    ok: true, draft,
    aplicados: res.aplicados, noEncontrados: res.noEncontrados, fueraDeAlcance: res.fueraDeAlcance,
    warnings: res.warnings,
  })
}
