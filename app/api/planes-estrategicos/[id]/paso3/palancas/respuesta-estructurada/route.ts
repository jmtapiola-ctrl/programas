// PATCH /api/planes-estrategicos/[id]/paso3/palancas/respuesta-estructurada
//
// Persiste la respuesta_estructurada del usuario para una pregunta específica
// del Sub-bloque 3.B (Palancas) o 3.D (Estrés). Llamado desde
// PanelInventarioInteractivo cuando el user clickea "Confirmar selección".
//
// Body: { id_pregunta: 'P-1' | 'P-2' | ... | 'V-1' | ... | 'E-1' | ...,
//         respuesta_estructurada: RespuestaEstructurada }
//
// El modo de la respuesta_estructurada DEBE matchear con el modo_interaccion
// que el modelo emitió para esa pregunta. Si no, 400.
//
// Buscamos la pregunta en plan.palancas.preguntas_principal,
// plan.palancas.preguntas_validador, y plan.estres.preguntas — el id_pregunta
// es único en todo el plan (P-N para principal, V-N para validador, E-N para
// estrés).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PlanoPE, RespuestaEstructurada, PalancaQAPE, EstresQAPE } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as {
    id_pregunta?: string
    respuesta_estructurada?: RespuestaEstructurada
  } | null

  if (!body?.id_pregunta || !body?.respuesta_estructurada) {
    return NextResponse.json({ error: 'Body debe incluir id_pregunta y respuesta_estructurada' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({ error: `Esperado paso_actual=3, got ${entrevista.paso_actual}.` }, { status: 409 })
  }

  // Buscar la pregunta. El id_pregunta indica donde:
  //   "P-N" → palancas.preguntas_principal
  //   "V-N" → palancas.preguntas_validador
  //   "E-N" → estres.preguntas
  const idPrefix = body.id_pregunta.slice(0, 1)
  let preguntaTarget: PalancaQAPE | EstresQAPE | undefined
  let containerKey: 'palancas_principal' | 'palancas_validador' | 'estres' | null = null

  if (idPrefix === 'P') {
    preguntaTarget = plan.plan?.palancas?.preguntas_principal?.find(q => q.id === body.id_pregunta)
    containerKey = 'palancas_principal'
  } else if (idPrefix === 'V') {
    preguntaTarget = plan.plan?.palancas?.preguntas_validador?.find(q => q.id === body.id_pregunta)
    containerKey = 'palancas_validador'
  } else if (idPrefix === 'E') {
    preguntaTarget = plan.plan?.estres?.preguntas?.find(q => q.id === body.id_pregunta)
    containerKey = 'estres'
  }

  if (!preguntaTarget || !containerKey) {
    return NextResponse.json({
      error: `Pregunta '${body.id_pregunta}' no encontrada. Esperado prefijo P/V/E.`,
    }, { status: 404 })
  }

  // Validar que el modo matchea con el modo_interaccion de la pregunta
  if (preguntaTarget.modo_interaccion && preguntaTarget.modo_interaccion !== body.respuesta_estructurada.modo) {
    return NextResponse.json({
      error: `Modo de respuesta '${body.respuesta_estructurada.modo}' no matchea con modo_interaccion '${preguntaTarget.modo_interaccion}' de la pregunta.`,
    }, { status: 400 })
  }

  // Persistir: replace en la lista correspondiente del plan
  const planActualizado: PlanoPE = JSON.parse(JSON.stringify(plan.plan ?? {}))
  if (containerKey === 'palancas_principal') {
    if (!planActualizado.palancas) planActualizado.palancas = { preguntas_principal: [], preguntas_validador: [] }
    planActualizado.palancas.preguntas_principal = planActualizado.palancas.preguntas_principal.map(q =>
      q.id === body.id_pregunta ? { ...q, respuesta_estructurada: body.respuesta_estructurada } : q
    )
  } else if (containerKey === 'palancas_validador') {
    if (!planActualizado.palancas) planActualizado.palancas = { preguntas_principal: [], preguntas_validador: [] }
    planActualizado.palancas.preguntas_validador = planActualizado.palancas.preguntas_validador.map(q =>
      q.id === body.id_pregunta ? { ...q, respuesta_estructurada: body.respuesta_estructurada } : q
    )
  } else {
    // estres
    if (!planActualizado.estres) planActualizado.estres = { preguntas: [] }
    planActualizado.estres.preguntas = planActualizado.estres.preguntas.map(q =>
      q.id === body.id_pregunta ? { ...q, respuesta_estructurada: body.respuesta_estructurada } : q
    )
  }

  await updatePlanEstrategico(planId, { plan: planActualizado })

  console.log('[paso3/palancas/respuesta-estructurada] done', JSON.stringify({
    plan_id: planId,
    id_pregunta: body.id_pregunta,
    container: containerKey,
    modo: body.respuesta_estructurada.modo,
  }))

  return NextResponse.json({
    ok: true,
    plan_actualizado: planActualizado,
  })
}
