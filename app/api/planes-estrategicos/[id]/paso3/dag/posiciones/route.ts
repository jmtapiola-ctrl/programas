// PATCH /api/planes-estrategicos/[id]/paso3/dag/posiciones
//
// Auto-save de posiciones del canvas (3.A.6). El cliente arrastra nodos o
// agrega/quita movs y dispara este endpoint con debounce. Persiste solo
// inventario.dag.movs — las precondiciones se persisten aparte vía
// /paso3/inventario/decision.
//
// Body: { movs: DAGMovPE[] }
// Response: { ok, inventario_actualizado }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PlanoPE, DAGPlanPE, DAGMovPE } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as { movs?: DAGMovPE[] } | null
  if (!body || !Array.isArray(body.movs)) {
    return NextResponse.json({ error: 'Body inválido: se esperaba { movs: DAGMovPE[] }.' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({
      error: `DAG posiciones solo durante Paso 3. paso_actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  const inv = plan.plan?.inventario
  if (!inv) return NextResponse.json({ error: 'No hay inventario.' }, { status: 409 })

  // Validar cada DAGMovPE contra el inventario.
  const idsValidos = new Set(inv.movimientos.map(m => m.id))
  for (const m of body.movs) {
    if (typeof m?.mov_id !== 'string' || !idsValidos.has(m.mov_id)) {
      return NextResponse.json({ error: `DAG.movs incluye mov_id "${m?.mov_id}" que no existe en el inventario.` }, { status: 400 })
    }
    if (typeof m.x !== 'number' || typeof m.y !== 'number') {
      return NextResponse.json({ error: `DAG.movs[${m.mov_id}] debe tener x e y numéricos.` }, { status: 400 })
    }
  }

  // Preservar generado_en si ya había DAG; si no, ponerlo ahora.
  const dagActualizado: DAGPlanPE = {
    movs: body.movs,
    generado_en: inv.dag?.generado_en ?? new Date().toISOString(),
  }

  const planActualizado: PlanoPE = {
    ...plan.plan,
    inventario: {
      ...inv,
      dag: dagActualizado,
    },
  }

  await updatePlanEstrategico(planId, { plan: planActualizado })

  return NextResponse.json({
    ok: true,
    inventario_actualizado: planActualizado.inventario,
  })
}
