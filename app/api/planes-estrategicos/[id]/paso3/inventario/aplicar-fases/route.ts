// POST /api/planes-estrategicos/[id]/paso3/inventario/aplicar-fases
//
// ⚠️ DEPRECADO desde V2 de P-4: el cliente no PATCHea más ventana_temporal —
// ahora `duracion_meses_ejecucion` es el dato real y `arranca/termina` se
// computan determinísticamente via computeSchedule (lib/computeSchedule.ts).
// Esta route queda como dormant para compat. Si vuelve a hacer falta un bulk
// rename, considerar usar el endpoint /paso3/inventario/decision por mov.
//
// Aplica bulk una nueva ventana_temporal a múltiples movs del inventario. El
// cliente envía un map movId → { arranca, termina } (formato YYYY-MM). El
// endpoint los aplica todos en memoria y persiste con UN SOLO PATCH a Airtable
// (el inventario vive en un JSON field, así que la mutación es atomic).
//
// Body: { asignaciones: { [movId: string]: { arranca: string; termina: string } } }
// Response: { ok: true, inventario_actualizado: InventarioPE, movs_afectados: number }
//         | { error, status }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PlanoPE } from '@/lib/types'

function esYM(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}$/.test(s)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as {
    asignaciones?: Record<string, { arranca?: string; termina?: string }>
  } | null
  if (!body || !body.asignaciones || typeof body.asignaciones !== 'object') {
    return NextResponse.json({ error: 'Body inválido: requiere { asignaciones: { movId: { arranca, termina } } }' }, { status: 400 })
  }

  // Filtrar entries válidas (arranca y termina deben ser YYYY-MM, arranca ≤ termina).
  const asignaciones = new Map<string, { arranca: string; termina: string }>()
  for (const [movId, v] of Object.entries(body.asignaciones)) {
    if (!v || !esYM(v.arranca) || !esYM(v.termina)) continue
    if (v.arranca > v.termina) continue  // string compare funciona para YYYY-MM
    asignaciones.set(movId, { arranca: v.arranca, termina: v.termina })
  }
  if (asignaciones.size === 0) {
    return NextResponse.json({ error: 'asignaciones vacío o sin entries válidas (formato YYYY-MM requerido).' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({
      error: `Aplicar fases solo durante Paso 3. paso_actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  if (!plan.plan?.inventario) {
    return NextResponse.json({ error: 'No hay inventario.' }, { status: 409 })
  }

  const inv = plan.plan.inventario

  let movsAfectados = 0
  const movimientos = inv.movimientos.map(m => {
    const target = asignaciones.get(m.id)
    if (!target) return m
    if (m.ventana_temporal?.arranca === target.arranca && m.ventana_temporal?.termina === target.termina) {
      return m  // no-op
    }
    movsAfectados++
    return { ...m, ventana_temporal: target }
  })

  if (movsAfectados === 0) {
    return NextResponse.json({
      ok: true,
      inventario_actualizado: inv,
      movs_afectados: 0,
      no_op: true,
    })
  }

  const planActualizado: PlanoPE = {
    ...plan.plan,
    inventario: { ...inv, movimientos },
  }
  await updatePlanEstrategico(planId, { plan: planActualizado })

  console.log('[paso3/inventario/aplicar-fases] done', JSON.stringify({
    plan_id: planId,
    movs_afectados: movsAfectados,
    asignaciones_solicitadas: asignaciones.size,
  }))

  return NextResponse.json({
    ok: true,
    inventario_actualizado: planActualizado.inventario,
    movs_afectados: movsAfectados,
  })
}
