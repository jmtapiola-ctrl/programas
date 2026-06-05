// POST /api/planes-estrategicos/[id]/admin/patch-proposito-metricas
//
// Patchea índices específicos del array proposito.metricas + opcionalmente
// registra un WarningRetroactivo en plan.warnings_retroactivos (audit trail).
//
// Es un escape hatch para cuando el modelo verbaliza cambios al propósito pero
// no los emite en su PANEL_UPDATE (bug recurrente del flow de retroactividad).
//
// Body: {
//   patches: Array<{ index: number; valor_objetivo?: string; metrica?: string; valor_actual?: string }>,
//   warning?: { bloque_afectado, descripcion_cambio, texto_previo?, impactos_detectados?[] }
// }
// Response: { ok: true, proposito_actualizado: PropositorPE, warning_id?: string }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PropositorPE, WarningRetroactivo, PlanoPE } from '@/lib/types'

type PatchEntry = {
  index: number
  metrica?: string
  valor_objetivo?: string
  valor_actual?: string
}

type WarningInput = {
  bloque_afectado: string
  descripcion_cambio: string
  texto_previo?: string
  impactos_detectados?: string[]
}

// GET: devuelve las métricas actuales del propósito para que la página admin
// las pueda pre-poblar. Sin esto el cliente tendría que hitear la API genérica
// de Airtable y conocer el field ID, lo cual no es robusto.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id: planId } = await params
  const plan = await getPlanEstrategico(planId).catch(() => null)
  if (!plan) return NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 })
  if (!plan.proposito) return NextResponse.json({ error: 'Plan sin propósito declarado.' }, { status: 409 })
  return NextResponse.json({
    ok: true,
    metricas: plan.proposito.metricas ?? [],
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as
    | { patches: PatchEntry[]; warning?: WarningInput }
    | null
  if (!body || !Array.isArray(body.patches) || body.patches.length === 0) {
    return NextResponse.json({ error: 'Body inválido. Requiere patches: Array<{index, valor_objetivo?, metrica?, valor_actual?}>.' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!plan.proposito) {
    return NextResponse.json({ error: 'Plan sin propósito declarado.' }, { status: 409 })
  }

  const metricas = [...(plan.proposito.metricas ?? [])]
  if (metricas.length === 0) {
    return NextResponse.json({ error: 'Propósito sin métricas declaradas.' }, { status: 409 })
  }

  // Aplicar patches en orden, validando que el index existe.
  for (const p of body.patches) {
    if (typeof p.index !== 'number' || p.index < 0 || p.index >= metricas.length) {
      return NextResponse.json({
        error: `Patch con index inválido: ${p.index}. Hay ${metricas.length} métricas (0 a ${metricas.length - 1}).`,
      }, { status: 400 })
    }
    const previa = metricas[p.index]
    metricas[p.index] = {
      metrica: p.metrica ?? previa.metrica,
      valor_objetivo: p.valor_objetivo ?? previa.valor_objetivo,
      valor_actual: p.valor_actual ?? previa.valor_actual,
    }
  }

  const propositoActualizado: PropositorPE = { ...plan.proposito, metricas }

  // Construir el update del plan + opcional warning.
  const updateData: { proposito: PropositorPE; plan?: PlanoPE } = { proposito: propositoActualizado }

  if (body.warning && plan.plan) {
    const warning: WarningRetroactivo = {
      timestamp: new Date().toISOString(),
      bloque_afectado: body.warning.bloque_afectado,
      paso_de_origen: entrevista?.paso_actual ?? 3,
      sub_bloque_de_origen: entrevista?.sub_bloque_actual ?? '3.E',
      texto_previo: body.warning.texto_previo ?? '(no especificado — aplicado vía admin endpoint)',
      descripcion_cambio: body.warning.descripcion_cambio,
      impactos_detectados: body.warning.impactos_detectados ?? [],
      confirmado_por_user: true,
    }
    updateData.plan = {
      ...plan.plan,
      warnings_retroactivos: [...(plan.plan.warnings_retroactivos ?? []), warning],
    }
  }

  await updatePlanEstrategico(planId, updateData)

  return NextResponse.json({
    ok: true,
    proposito_actualizado: propositoActualizado,
    patches_aplicados: body.patches.length,
    warning_registrado: !!body.warning,
  })
}
