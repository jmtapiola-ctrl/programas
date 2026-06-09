// POST /api/planes-estrategicos/[id]/draft/aplicar-al-plan
//
// Commitea el BORRADOR al plan vivo: reemplaza proposito/situacion/criterio con
// los del borrador, registra los cambios como warnings_retroactivos, crea una
// VERSIÓN NUEVA inmutable (trigger=reconcile) y limpia el borrador.
//
// Response: { ok, version, cambios }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPlanAccess } from '@/lib/auth-ownership'
import {
  getPlanDraft, clearPlanDraft,
  updatePlanEstrategico, getPlanVersiones, createPlanVersion,
} from '@/lib/airtable'
import { denormalizarPlanVersionSnapshot, siguienteNumeroVersion } from '@/lib/version-persistence'
import type { PlanEstrategico, PlanoPE, WarningRetroactivo } from '@/lib/types'

export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const access = await checkPlanAccess(session.user as any, planId)
  if (!access.allowed || !access.plan) {
    return NextResponse.json({ error: access.error ?? 'Sin acceso' }, { status: access.status ?? 403 })
  }
  const plan = access.plan

  const draft = await getPlanDraft(planId)
  if (!draft) return NextResponse.json({ error: 'No hay borrador para aplicar.' }, { status: 409 })

  const aplicados = draft.cambios_aplicados ?? []
  const aplicadosInv = draft.cambios_inventario_aplicados ?? []
  if (aplicados.length === 0 && aplicadosInv.length === 0) {
    return NextResponse.json({ error: 'El borrador no tiene cambios confirmados. Aplicá algún cambio antes de commitear, o descartá.' }, { status: 400 })
  }

  // Construir el plan nuevo: campos editables desde el borrador + audit trail.
  const planNuevo: PlanEstrategico = JSON.parse(JSON.stringify(plan))
  planNuevo.proposito = draft.proposito ?? planNuevo.proposito
  planNuevo.situacion = draft.situacion ?? planNuevo.situacion
  if (!planNuevo.plan) planNuevo.plan = {} as PlanoPE
  if (draft.preparativos) planNuevo.plan.preparativos = draft.preparativos
  if (draft.inventario) planNuevo.plan.inventario = draft.inventario
  if (!planNuevo.plan.warnings_retroactivos) planNuevo.plan.warnings_retroactivos = []
  const ahora = new Date().toISOString()
  for (const ch of aplicados) {
    const w: WarningRetroactivo = {
      timestamp: ahora,
      bloque_afectado: ch.surface,
      paso_de_origen: 3,
      sub_bloque_de_origen: 'edicion-plan-cerrado',
      texto_previo: ch.que_dice_estructura,
      descripcion_cambio: `Edición plan cerrado: ${ch.cambio_propuesto.slice(0, 280)}${ch.cambio_propuesto.length > 280 ? '…' : ''}`,
      impactos_detectados: [`Severidad: ${ch.severidad}`, ch.que_dice_narrativa.slice(0, 160)],
      confirmado_por_user: true,
    }
    planNuevo.plan.warnings_retroactivos.push(w)
  }
  for (const ch of aplicadosInv) {
    const desc = ch.campo
      ? `${ch.mov_id}.${ch.campo} → ${JSON.stringify(ch.valor_nuevo).slice(0, 200)}`
      : `${ch.mov_id} dependencia ${ch.dep?.accion} ${ch.dep?.desde}${ch.dep?.tipo ? ` (${ch.dep.tipo})` : ''}`
    planNuevo.plan.warnings_retroactivos.push({
      timestamp: ahora,
      bloque_afectado: `inventario · ${ch.mov_id}`,
      paso_de_origen: 3,
      sub_bloque_de_origen: 'edicion-plan-cerrado',
      texto_previo: ch.valor_anterior ?? '',
      descripcion_cambio: `Edición inventario: ${desc}`,
      impactos_detectados: [`Severidad: ${ch.severidad ?? 'Media'}`, ch.motivo ?? ''],
      confirmado_por_user: true,
    })
  }

  // Versión nueva.
  const versionesPrev = await getPlanVersiones(planId).catch(() => [])
  const numero = siguienteNumeroVersion(versionesPrev)
  planNuevo.version_activa_label = numero

  await updatePlanEstrategico(planId, {
    proposito: planNuevo.proposito,
    situacion: planNuevo.situacion,
    plan: planNuevo.plan,
    version_activa_label: numero,
    editable: false,
  })
  await createPlanVersion({
    planId,
    numero,
    trigger: 'reconcile',
    creadaPor: (session.user as any).id ?? '',
    resumenCambio: `Edición plan cerrado: ${aplicados.length} texto(s) + ${aplicadosInv.length} inventario.`,
    snapshot: denormalizarPlanVersionSnapshot(planNuevo),
  })
  await clearPlanDraft(planId)

  return NextResponse.json({ ok: true, version: numero, cambios: aplicados.length + aplicadosInv.length })
}
