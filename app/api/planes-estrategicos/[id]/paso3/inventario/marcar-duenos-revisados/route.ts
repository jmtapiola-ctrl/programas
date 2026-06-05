// POST /api/planes-estrategicos/[id]/paso3/inventario/marcar-duenos-revisados
//
// Persiste en inventario.duenos_revisados_signature la firma del set actual
// de dueños activos. La firma sirve para detectar — en futuros mounts del
// editor P-4 — si el set de dueños cambió desde el último review; si no
// cambió, skipeamos el modal de UnificarDuenos y abrimos el canvas directo.
//
// Se llama desde el "Continuar al editor" del UnificarDuenosModal. Idempotente.
//
// Body: {} (computa la firma server-side desde el inventario actual)
// Response: { ok, signature, inventario_actualizado }

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
  const signature = computeDuenosSignature(inv.movimientos)

  // No-op si ya está marcada con la misma firma.
  if (inv.duenos_revisados_signature === signature) {
    return NextResponse.json({
      ok: true,
      no_op: true,
      signature,
      inventario_actualizado: inv,
    })
  }

  const planActualizado: PlanoPE = {
    ...plan.plan,
    inventario: { ...inv, duenos_revisados_signature: signature },
  }
  await updatePlanEstrategico(planId, { plan: planActualizado })

  console.log('[paso3/inventario/marcar-duenos-revisados] done', JSON.stringify({
    plan_id: planId,
    signature_preview: signature.slice(0, 80),
  }))

  return NextResponse.json({
    ok: true,
    signature,
    inventario_actualizado: planActualizado.inventario,
  })
}
