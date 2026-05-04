// PATCH /api/planes-estrategicos/[id]/paso3/palancas/respuestas
//
// Persiste las respuestas del usuario a las preguntas del validador
// cross-provider del Sub-bloque 3.B. Llamado desde el modal
// PalancasValidadorModal cuando el usuario termina de responder.
//
// Body: {
//   preguntas_validador: PalancaQAPE[]  // las preguntas con sus respuestas
//   costo_validador_usd?: number        // costo de la llamada al validador (tracking)
//   latencia_validador_ms?: number      // latencia (tracking)
// }
//
// También transiciona sub_bloque_actual de '3.B' a '3.C' (cierre interno
// no formal — sin snapshot, mismo patrón que el cierre de 3.B según diseño).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
  updateEntrevistaPE,
} from '@/lib/airtable'
import type { PalancaQAPE, PlanoPE } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as {
    preguntas_validador?: PalancaQAPE[]
    costo_validador_usd?: number
    latencia_validador_ms?: number
  } | null

  if (!body || !Array.isArray(body.preguntas_validador)) {
    return NextResponse.json({ error: 'Body debe incluir preguntas_validador como array' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({ error: `Esperado paso_actual=3, got ${entrevista.paso_actual}.` }, { status: 409 })
  }

  const palancasActuales = plan.plan?.palancas
  if (!palancasActuales) {
    return NextResponse.json({ error: 'No hay plan.palancas que actualizar.' }, { status: 409 })
  }

  // Persistir preguntas_validador con respuestas del usuario.
  const planActualizado: PlanoPE = {
    ...plan.plan,
    palancas: {
      ...palancasActuales,
      preguntas_validador: body.preguntas_validador,
      costo_validador_usd: body.costo_validador_usd ?? palancasActuales.costo_validador_usd,
      latencia_validador_ms: body.latencia_validador_ms ?? palancasActuales.latencia_validador_ms,
    },
  }
  await updatePlanEstrategico(planId, { plan: planActualizado })

  // Transición sub_bloque 3.B → 3.C (cierre interno no formal — sin snapshot).
  if (entrevista.sub_bloque_actual === '3.B') {
    await updateEntrevistaPE(entrevista.id, { sub_bloque_actual: '3.C' })
  }

  console.log('[paso3/palancas/respuestas] done', JSON.stringify({
    plan_id: planId,
    preguntas_validador_count: body.preguntas_validador.length,
    sub_bloque_nuevo: '3.C',
  }))

  return NextResponse.json({
    ok: true,
    plan_actualizado: planActualizado,
    sub_bloque_actual: '3.C',
  })
}
