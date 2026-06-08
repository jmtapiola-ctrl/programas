// POST /api/planes-estrategicos/[id]/reconcile/apply
//
// Coordinación (reconcile) — Stage B: aplica los cambios APROBADOS por el usuario
// al plan estructurado (solo superficies de texto de V1), crea una versión nueva
// inmutable (trigger='reconcile'), y regenera la narrativa desde la nueva versión.
//
// Body: { changes: ReconcileChange[] }  // los aprobados (con cambio_propuesto ya editado si aplica)
// Response: { ok, aplicados, noEncontrados, fueraDeAlcance, version, narrativa, warnings }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPlanAccess } from '@/lib/auth-ownership'
import {
  updatePlanEstrategico,
  updatePlanNarrativa,
  getPlanVersiones,
  createPlanVersion,
} from '@/lib/airtable'
import { aplicarReconcileChanges } from '@/lib/reconcile-apply'
import { denormalizarPlanVersionSnapshot, siguienteNumeroVersion } from '@/lib/version-persistence'
import { generarNarrativaDesdePlan } from '@/lib/narrativa-generate'
import type { ReconcileChange } from '@/lib/types'

export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const access = await checkPlanAccess(session.user as any, planId)
  if (!access.allowed || !access.plan) {
    return NextResponse.json({ error: access.error ?? 'Sin acceso' }, { status: access.status ?? 403 })
  }
  const plan = access.plan

  const body = await req.json().catch(() => ({}))
  const changes: ReconcileChange[] = Array.isArray(body?.changes) ? body.changes : []
  if (changes.length === 0) {
    return NextResponse.json({ error: 'No hay cambios aprobados para aplicar.' }, { status: 400 })
  }

  // Stage B determinístico: aplicar las sustituciones aprobadas.
  const res = aplicarReconcileChanges(plan, changes)
  if (res.aplicados === 0) {
    return NextResponse.json({
      ok: true, aplicados: 0, noEncontrados: res.noEncontrados, fueraDeAlcance: res.fueraDeAlcance,
      warnings: res.warnings, version: plan.version_activa_label ?? null,
      mensaje: 'Ningún cambio se pudo aplicar (no se localizó el texto estructural). Nada cambió.',
    })
  }

  // Numero de la versión nueva.
  const versionesPrev = await getPlanVersiones(planId).catch(() => [])
  const numero = siguienteNumeroVersion(versionesPrev)

  const planNuevo = res.planActualizado
  planNuevo.version_activa_label = numero

  // Persistir el plan vivo con los campos modificados + el label de versión.
  await updatePlanEstrategico(planId, {
    proposito: planNuevo.proposito,
    situacion: planNuevo.situacion,
    plan: planNuevo.plan,
    version_activa_label: numero,
  })

  // Crear la versión inmutable (snapshot del plan ya actualizado).
  await createPlanVersion({
    planId,
    numero,
    trigger: 'reconcile',
    creadaPor: (session.user as any).id ?? '',
    resumenCambio: `Reconcile: ${res.aplicados} cambio(s) aplicado(s)${res.fieldsModificados.length ? ` — ${[...new Set(res.fieldsModificados)].slice(0, 4).join(', ')}` : ''}.`,
    snapshot: denormalizarPlanVersionSnapshot(planNuevo),
  })

  // Regenerar la narrativa desde la nueva versión (best-effort). Si falla, queda
  // la vieja; el usuario puede regenerar a mano (force) al reabrir.
  let narrativa = null
  try {
    narrativa = await generarNarrativaDesdePlan(planNuevo)
    await updatePlanNarrativa(planId, narrativa)
  } catch (e) {
    console.warn('[reconcile/apply] no se pudo regenerar la narrativa:', (e as any)?.message)
  }

  return NextResponse.json({
    ok: true,
    aplicados: res.aplicados,
    noEncontrados: res.noEncontrados,
    fueraDeAlcance: res.fueraDeAlcance,
    fieldsModificados: res.fieldsModificados,
    warnings: res.warnings,
    version: numero,
    narrativa,
  })
}
