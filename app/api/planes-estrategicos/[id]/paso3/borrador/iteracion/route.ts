// PATCH /api/planes-estrategicos/[id]/paso3/borrador/iteracion
//
// Acciones sobre la iteración actual del borrador del Sub-bloque 3.C:
//   - Marcar `iteracion_aceptada` cuando el usuario acepta la iteración N
//     (action: 'aceptar' + numero_iteracion).
//   - Transicionar entrevista.sub_bloque_actual de 3.C → 3.D.
//
// Body: { action: 'aceptar', numero_iteracion: 1|2|3 }
// Response: { ok: true, plan_actualizado: PlanoPE, sub_bloque_actual: '3.D' }
//
// Generación de nuevas iteraciones va por POST /paso3/borrador/generar — este
// endpoint NO genera, solo persiste decisiones del usuario sobre lo ya generado.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
  updateEntrevistaPE,
} from '@/lib/airtable'
import type { PlanoPE } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as {
    action?: 'aceptar'
    numero_iteracion?: 1 | 2 | 3
  } | null

  if (body?.action !== 'aceptar') {
    return NextResponse.json({ error: `Action inválida: ${body?.action}. Esperado 'aceptar'.` }, { status: 400 })
  }
  const numero = body.numero_iteracion
  if (numero !== 1 && numero !== 2 && numero !== 3) {
    return NextResponse.json({ error: 'numero_iteracion debe ser 1, 2 o 3.' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({
      error: `Acción solo válida en Paso 3. paso_actual actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  const iteraciones = plan.plan?.borrador?.iteraciones ?? []
  if (iteraciones.length === 0) {
    return NextResponse.json({ error: 'No hay iteraciones para aceptar — generá primero.' }, { status: 409 })
  }
  if (numero > iteraciones.length) {
    return NextResponse.json({
      error: `numero_iteracion=${numero} no existe. Solo hay ${iteraciones.length} iteración(es) generada(s).`,
    }, { status: 409 })
  }

  const planActualizado: PlanoPE = {
    ...plan.plan,
    borrador: {
      iteraciones,
      iteracion_aceptada: numero,
    },
  }
  await updatePlanEstrategico(planId, { plan: planActualizado })

  // Transición sub_bloque 3.C → 3.D (cierre interno no formal, mismo patrón
  // que /paso3/palancas/respuestas que transiciona 3.B → 3.C).
  let subBloqueNuevo = entrevista.sub_bloque_actual
  if (entrevista.sub_bloque_actual === '3.C') {
    await updateEntrevistaPE(entrevista.id, { sub_bloque_actual: '3.D' })
    subBloqueNuevo = '3.D'
  }

  console.log('[paso3/borrador/iteracion] aceptada', JSON.stringify({
    plan_id: planId,
    numero_iteracion: numero,
    total_iteraciones: iteraciones.length,
    sub_bloque_nuevo: subBloqueNuevo,
  }))

  return NextResponse.json({
    ok: true,
    plan_actualizado: planActualizado,
    sub_bloque_actual: subBloqueNuevo,
  })
}
