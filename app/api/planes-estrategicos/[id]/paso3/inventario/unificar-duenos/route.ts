// POST /api/planes-estrategicos/[id]/paso3/inventario/unificar-duenos
//
// Aplica bulk rename de dueños en el inventario. El cliente envía un map
// movId → canonico_nuevo, el endpoint aplica todos los cambios en memoria y
// persiste en UN SOLO PATCH a Airtable (el inventario vive en un JSON field).
//
// Pattern: si un cluster tenía variantes ['Lu', 'Lucas M.'] y canónico
// 'Lucas Mercado', el cliente arma renames = { M-3: 'Lucas Mercado',
// M-7: 'Lucas Mercado', ... } (un entry por mov afectado). El endpoint solo
// reescribe `mov.dueno = renames[mov.id]` cuando corresponde.
//
// Body: { renames: { [movId: string]: string } }
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
import { computeDuenosSignature } from '@/lib/dueno-signature'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as { renames?: Record<string, string> } | null
  if (!body || !body.renames || typeof body.renames !== 'object') {
    return NextResponse.json({ error: 'Body inválido: requiere { renames: { movId: nuevoDueno } }' }, { status: 400 })
  }

  const renames = body.renames
  const renameEntries = Object.entries(renames).filter(([_movId, val]) => typeof val === 'string' && val.trim())
  if (renameEntries.length === 0) {
    return NextResponse.json({ error: 'renames vacío o sin entries válidas.' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({
      error: `Unificación de dueños solo durante Paso 3. paso_actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  if (!plan.plan?.inventario) {
    return NextResponse.json({ error: 'No hay inventario.' }, { status: 409 })
  }

  const inv = plan.plan.inventario
  const renamesMap = new Map<string, string>(renameEntries.map(([k, v]) => [k, v.trim()]))

  let movsAfectados = 0
  const movimientos = inv.movimientos.map(m => {
    const nuevoDueno = renamesMap.get(m.id)
    if (nuevoDueno === undefined) return m
    if (nuevoDueno === m.dueno) return m  // no-op si ya tiene ese dueño
    movsAfectados++
    return { ...m, dueno: nuevoDueno }
  })

  if (movsAfectados === 0) {
    return NextResponse.json({
      ok: true,
      inventario_actualizado: inv,
      movs_afectados: 0,
      no_op: true,
    })
  }

  // Aplicar unificaciones implica un review explícito por parte del user; al
  // mismo tiempo persistimos la firma del set post-rename para que el próximo
  // mount del editor P-4 skipee el modal.
  const planActualizado: PlanoPE = {
    ...plan.plan,
    inventario: {
      ...inv,
      movimientos,
      duenos_revisados_signature: computeDuenosSignature(movimientos),
    },
  }
  await updatePlanEstrategico(planId, { plan: planActualizado })

  console.log('[paso3/inventario/unificar-duenos] done', JSON.stringify({
    plan_id: planId,
    movs_afectados: movsAfectados,
    renames_solicitados: renameEntries.length,
  }))

  return NextResponse.json({
    ok: true,
    inventario_actualizado: planActualizado.inventario,
    movs_afectados: movsAfectados,
  })
}
