// POST /api/planes-estrategicos/[id]/draft/iniciar
//
// Entra en modo edición de un plan cerrado: crea (si no existe) un BORRADOR
// desacoplado copiando las superficies editables (proposito/situacion/criterio)
// del plan vivo, y setea Editable=true. Idempotente.
//
// Response: { ok, draft: PlanDraft }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { getPlanDraft, updatePlanDraft, updatePlanEstrategico } from '@/lib/airtable'
import type { PlanDraft } from '@/lib/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const access = await checkPlanAccess(session.user as any, planId)
  if (!access.allowed || !access.plan) {
    return NextResponse.json({ error: access.error ?? 'Sin acceso' }, { status: access.status ?? 403 })
  }
  const plan = access.plan

  await updatePlanEstrategico(planId, { editable: true })

  const existente = await getPlanDraft(planId)
  if (existente) return NextResponse.json({ ok: true, draft: existente, nuevo: false })

  const ahora = new Date().toISOString()
  const draft: PlanDraft = {
    base_version: plan.version_activa_label ?? 'V1',
    creado_en: ahora,
    actualizado_en: ahora,
    proposito: plan.proposito,
    situacion: plan.situacion,
    preparativos: plan.plan?.preparativos,
    inventario: plan.plan?.inventario,
    mensajes: [],
    cambios_aplicados: [],
    cambios_inventario_aplicados: [],
  }
  await updatePlanDraft(planId, draft)
  return NextResponse.json({ ok: true, draft, nuevo: true })
}
