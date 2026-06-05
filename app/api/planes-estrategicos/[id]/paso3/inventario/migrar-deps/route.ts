// POST /api/planes-estrategicos/[id]/paso3/inventario/migrar-deps
//
// Migra los strings legacy de tipo de dependencia ('dura' | 'blanda') a los
// nuevos canónicos ('sugerida' | 'ff' | 'fs'). Mapeo:
//   'dura'   → 'ff'        (intent original del user: A debe terminar para que B cierre)
//   'blanda' → 'sugerida'  (rename, mismo significado)
//
// Reads de planes legacy ya normalizan al leer via normalizeDepTipoEdge, pero
// esto reescribe Airtable para que los strings persistidos también sean los
// nuevos canónicos. Idempotente: re-correr no rompe nada (los nuevos pasan
// por normalize y devuelven sí mismos).
//
// Body: {} (no requiere args — opera sobre el inventario completo)
// Response: { ok, movs_afectados, inventario_actualizado }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PlanoPE, MovimientoPE, DependenciaTipo } from '@/lib/types'
import { normalizeDependenciaTipo, normalizeDepTipoEdge } from '@/lib/types'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (!plan.plan?.inventario) {
    return NextResponse.json({ error: 'No hay inventario.' }, { status: 409 })
  }

  const inv = plan.plan.inventario
  let movsAfectados = 0

  const movimientos: MovimientoPE[] = inv.movimientos.map(m => {
    let cambio = false
    const tipoGlobalNuevo: DependenciaTipo = normalizeDependenciaTipo(m.tipo_dependencia)
    if (tipoGlobalNuevo !== m.tipo_dependencia) cambio = true

    let precondTipoNuevo: { [k: string]: 'sugerida' | 'ff' | 'fs' | 'continuo' } | undefined = m.precondiciones_tipo as any
    if (m.precondiciones_tipo && typeof m.precondiciones_tipo === 'object') {
      const remap: { [k: string]: 'sugerida' | 'ff' | 'fs' | 'continuo' } = {}
      let mapChanged = false
      for (const [k, v] of Object.entries(m.precondiciones_tipo)) {
        const nuevo = normalizeDepTipoEdge(v as string)
        if (nuevo !== v) mapChanged = true
        remap[k] = nuevo
      }
      if (mapChanged) {
        precondTipoNuevo = remap
        cambio = true
      }
    }

    if (!cambio) return m
    movsAfectados++
    return {
      ...m,
      tipo_dependencia: tipoGlobalNuevo,
      ...(precondTipoNuevo ? { precondiciones_tipo: precondTipoNuevo } : {}),
    }
  })

  if (movsAfectados === 0) {
    return NextResponse.json({
      ok: true,
      no_op: true,
      movs_afectados: 0,
      inventario_actualizado: inv,
    })
  }

  const planActualizado: PlanoPE = {
    ...plan.plan,
    inventario: { ...inv, movimientos },
  }
  await updatePlanEstrategico(planId, { plan: planActualizado })

  console.log('[paso3/inventario/migrar-deps] done', JSON.stringify({
    plan_id: planId,
    movs_afectados: movsAfectados,
  }))

  return NextResponse.json({
    ok: true,
    movs_afectados: movsAfectados,
    inventario_actualizado: planActualizado.inventario,
  })
}
