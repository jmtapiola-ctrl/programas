// PATCH /api/planes-estrategicos/[id]/audit/[turno_id]/decision
//
// Persiste el array completo de decisiones del usuario sobre los hallazgos
// del reporte del reviewer. Se llama desde Pantalla 3 cada vez que el usuario
// toma o modifica una decisión (no batch al final).
//
// Diseño "array completo en cada PATCH":
//   - El frontend mantiene el estado local autoritativo de las decisiones.
//   - En cada cambio, manda el array completo al backend.
//   - Backend persiste sin lógica adicional (overwrite).
//   - Trade-off: más writes vs simpler logic. Acceptable para volumen bajo
//     (1 audit ≈ 14 hallazgos máx, ≈ 14 PATCHes total por audit en el peor
//     caso). Si se vuelve issue, se puede pasar a delta-patch en Fase 4.
//
// Body: { decisiones: DecisionUsuario[] }
// Devuelve: { ok: true }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEntrevistaPE, getReviewerTurnos, updateReviewerDecisionesOnly } from '@/lib/airtable'
import type { DecisionUsuario } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; turno_id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId, turno_id: turnoId } = await params

  const body = await req.json().catch(() => null) as { decisiones?: DecisionUsuario[] } | null
  if (!body || !Array.isArray(body.decisiones)) {
    return NextResponse.json({ error: 'body.decisiones debe ser array' }, { status: 400 })
  }

  // Validación shallow del shape de cada decisión.
  for (const [i, d] of body.decisiones.entries()) {
    if (typeof d?.hallazgo_id !== 'string') {
      return NextResponse.json({ error: `decisiones[${i}].hallazgo_id debe ser string` }, { status: 400 })
    }
    if (!['error', 'pregunta', 'cross_block'].includes(d.tipo as string)) {
      return NextResponse.json({ error: `decisiones[${i}].tipo inválido: ${d.tipo}` }, { status: 400 })
    }
    if (!['aprobado', 'aprobado_con_cambios', 'ignorado', 'respondido'].includes(d.decision as string)) {
      return NextResponse.json({ error: `decisiones[${i}].decision inválida: ${d.decision}` }, { status: 400 })
    }
  }

  // Verificar que la entrevista existe y que el turnoId pertenece a esta entrevista.
  const entrevista = await getEntrevistaPE(planId)
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  const [revPaso1, revPaso2] = await Promise.all([
    getReviewerTurnos(entrevista.id, 1),
    getReviewerTurnos(entrevista.id, 2),
  ])
  const reviewer = [...revPaso1, ...revPaso2].find(r => r.airtableId === turnoId)
  if (!reviewer) {
    return NextResponse.json({ error: 'Turno reviewer no encontrado' }, { status: 404 })
  }

  // Persistir SOLO el array de decisiones. Snapshot pre-apply + apply metrics
  // se actualizan exclusivamente desde /apply (Fase 4) cuando el user aprieta
  // "Procesar todos los cambios y avanzar".
  await updateReviewerDecisionesOnly(turnoId, body.decisiones)

  return NextResponse.json({ ok: true, decisiones_count: body.decisiones.length })
}
