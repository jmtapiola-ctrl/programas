// POST /api/planes-estrategicos/[id]/paso3/retroactividad/confirmar
//
// Llamado desde RetroactividadControlSuaveModal cuando el usuario clickea
// "Confirmar". Append-only a plan.warnings_retroactivos. NO modifica los trees
// del plan (esa mutación la hace el modelo en el próximo turno del chat, tras
// recibir el mensaje "[Sistema] Usuario confirma cambio retroactivo: ...").
//
// Body: {
//   bloque_afectado: string
//   texto_previo: string
//   descripcion_cambio: string
//   impactos_detectados: string[]
// }
// Response: { ok: true, plan_actualizado: PlanoPE, warning: WarningRetroactivo }
//
// Trazabilidad: el WarningRetroactivo queda en plan.warnings_retroactivos
// con timestamp + bloque + texto previo + descripción + impactos. Append-only,
// inmutable después.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PlanoPE, WarningRetroactivo } from '@/lib/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as {
    bloque_afectado?: string
    texto_previo?: string
    descripcion_cambio?: string
    impactos_detectados?: string[]
  } | null

  if (!body?.bloque_afectado || typeof body.bloque_afectado !== 'string') {
    return NextResponse.json({ error: 'bloque_afectado requerido (string)' }, { status: 400 })
  }
  if (typeof body.descripcion_cambio !== 'string') {
    return NextResponse.json({ error: 'descripcion_cambio requerido (string)' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  const warning: WarningRetroactivo = {
    timestamp: new Date().toISOString(),
    bloque_afectado: body.bloque_afectado,
    paso_de_origen: entrevista.paso_actual,
    sub_bloque_de_origen: entrevista.sub_bloque_actual ?? '0',
    texto_previo: body.texto_previo ?? '',
    descripcion_cambio: body.descripcion_cambio,
    impactos_detectados: Array.isArray(body.impactos_detectados) ? body.impactos_detectados : [],
    confirmado_por_user: true,
  }

  const warningsExistentes = plan.plan?.warnings_retroactivos ?? []
  const planActualizado: PlanoPE = {
    ...plan.plan,
    warnings_retroactivos: [...warningsExistentes, warning],
  }
  await updatePlanEstrategico(planId, { plan: planActualizado })

  console.log('[paso3/retroactividad/confirmar]', JSON.stringify({
    plan_id: planId,
    bloque_afectado: warning.bloque_afectado,
    paso_de_origen: warning.paso_de_origen,
    impactos_count: warning.impactos_detectados.length,
    warnings_total: planActualizado.warnings_retroactivos!.length,
  }))

  return NextResponse.json({
    ok: true,
    warning,
    plan_actualizado: planActualizado,
  })
}
