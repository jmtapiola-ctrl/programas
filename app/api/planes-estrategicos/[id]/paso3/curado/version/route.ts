// PATCH /api/planes-estrategicos/[id]/paso3/curado/version
//
// Cambia plan.curado.version_activa para que el user pueda navegar entre
// versiones generadas del plan curado sin perder ninguna (versionado no-
// destructivo, Feature 2 — 3.E).
//
// Body: { version: number }   // índice 0-based dentro de versiones[]
// Response: { ok: true, version_activa: number, plan_actualizado: PlanoPE }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PlanoPE } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as { version?: number } | null
  const version = body?.version

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return NextResponse.json({
      error: 'Body debe incluir version: number (índice 0-based no-negativo).',
    }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  const curado = plan.plan?.curado
  if (!curado || !curado.versiones || curado.versiones.length === 0) {
    return NextResponse.json({
      error: 'No hay versiones de curado para seleccionar — generá una primero.',
    }, { status: 409 })
  }
  if (version >= curado.versiones.length) {
    return NextResponse.json({
      error: `version=${version} no existe. Versiones disponibles: 0..${curado.versiones.length - 1}.`,
    }, { status: 400 })
  }

  if (curado.version_activa === version) {
    // No-op — devolvemos OK sin escribir.
    return NextResponse.json({
      ok: true,
      version_activa: version,
      plan_actualizado: plan.plan,
      no_op: true,
    })
  }

  const planActualizado: PlanoPE = {
    ...plan.plan,
    curado: {
      versiones: curado.versiones,
      version_activa: version,
    },
  }
  await updatePlanEstrategico(planId, { plan: planActualizado })

  console.log('[paso3/curado/version] cambio', JSON.stringify({
    plan_id: planId,
    version_previa: curado.version_activa,
    version_nueva: version,
    total_versiones: curado.versiones.length,
  }))

  return NextResponse.json({
    ok: true,
    version_activa: version,
    plan_actualizado: planActualizado,
  })
}
