// POST /api/planes-estrategicos/[id]/versiones/restaurar
//
// Restaura una versión anterior: copia su snapshot al plan vivo y crea una
// versión nueva (trigger=restauracion). El contenido que estaba vivo NO se pierde
// — ya está guardado en su propia versión. No destructivo.
//
// Body: { numero: string }
// Response: { ok, version }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { getPlanVersiones, createPlanVersion, updatePlanEstrategico } from '@/lib/airtable'
import { hidratarPlanVersionSnapshot, denormalizarPlanVersionSnapshot, siguienteNumeroVersion } from '@/lib/version-persistence'
import type { PlanEstrategico, PlanoPE } from '@/lib/types'

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

  const numero = (((await req.json().catch(() => ({})))?.numero) ?? '').toString().trim()
  if (!numero) return NextResponse.json({ error: 'Falta el número de versión.' }, { status: 400 })

  const versiones = await getPlanVersiones(planId)
  const target = versiones.find(v => v.numero === numero)
  if (!target) return NextResponse.json({ error: `Versión ${numero} no encontrada.` }, { status: 404 })

  // Hidratar el snapshot (self-contained) y volcarlo al plan vivo.
  const hyd = hidratarPlanVersionSnapshot(
    target.snapshot,
    plan.plan?.inventario?.movimientos,   // resuelve snapshots viejos (ids) y self-contained
    plan.plan?.curado?.versiones,
  )
  const planNuevo: PlanEstrategico = JSON.parse(JSON.stringify(plan))
  planNuevo.proposito = hyd.proposito
  planNuevo.situacion = hyd.situacion
  planNuevo.datos_faltantes = hyd.datos_faltantes
  if (!planNuevo.plan) planNuevo.plan = {} as PlanoPE
  planNuevo.plan.preparativos = hyd.preparativos
  planNuevo.plan.inventario = {
    ...(plan.plan?.inventario as any),
    movimientos: hyd.movimientos,
    dag: target.snapshot.inventario_ref.dag,
  } as any

  // Versión nueva (no destructiva).
  const nuevoNumero = siguienteNumeroVersion(versiones)
  planNuevo.version_activa_label = nuevoNumero

  await updatePlanEstrategico(planId, {
    proposito: planNuevo.proposito,
    situacion: planNuevo.situacion,
    plan: planNuevo.plan,
    version_activa_label: nuevoNumero,
    editable: false,
  })
  await createPlanVersion({
    planId,
    numero: nuevoNumero,
    trigger: 'restauracion',
    creadaPor: (session.user as any).id ?? '',
    resumenCambio: `Restauración de la versión ${numero}.`,
    snapshot: denormalizarPlanVersionSnapshot(planNuevo),
  })

  return NextResponse.json({ ok: true, version: nuevoNumero, restaurada_de: numero })
}
