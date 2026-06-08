// POST /api/planes-estrategicos/[id]/narrativa/generar
//
// Entra en modo edición de un plan cerrado: setea Editable=true y genera la capa
// narrativa (prosa del plan entero) si todavía no existe. Idempotente: si ya hay
// narrativa, la devuelve sin regenerar (salvo body.force=true).
//
// Body: { force?: boolean }
// Response: { ok: true, narrativa: PlanNarrativa }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { getPlanNarrativa, updatePlanNarrativa, updatePlanEstrategico } from '@/lib/airtable'
import { generarNarrativaDesdePlan } from '@/lib/narrativa-generate'

export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const access = await checkPlanAccess(session.user as any, planId)
  if (!access.allowed || !access.plan) {
    return NextResponse.json({ error: access.error ?? 'Sin acceso' }, { status: access.status ?? 403 })
  }
  const plan = access.plan
  const body = await req.json().catch(() => ({}))
  const force = body?.force === true

  // Entrar a modo edición.
  await updatePlanEstrategico(planId, { editable: true })

  // Si ya hay narrativa y no se fuerza, devolverla.
  const existente = await getPlanNarrativa(planId)
  if (existente && !force) {
    return NextResponse.json({ ok: true, narrativa: existente, regenerada: false })
  }

  // Generar la prosa + anclas desde el plan estructurado.
  let narrativa
  try {
    narrativa = await generarNarrativaDesdePlan(plan)
  } catch (e) {
    return NextResponse.json({ error: `La IA falló al generar la narrativa: ${(e as any)?.message ?? e}` }, { status: 500 })
  }
  await updatePlanNarrativa(planId, narrativa)
  return NextResponse.json({ ok: true, narrativa, regenerada: true })
}
