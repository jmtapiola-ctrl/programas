// POST /api/planes-estrategicos/[id]/cerrar-paso-final
//
// Cierre definitivo del Paso N. Crea snapshot inmutable (turno rol=snapshot)
// con el resumen actualizado, transiciona a 'completo', incrementa paso_actual
// a N+1 y resetea sub_estado_paso a 'en_curso' para arrancar el siguiente Paso.
//
// Body: { paso: number }
// Devuelve: { ok: true, redirect: '/planes-estrategicos/<id>/entrevista' }
//
// Estado: requiere `esperando_aprobacion_final`.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  getTurnosPE,
  appendSnapshotTurno,
  updateEntrevistaPE,
} from '@/lib/airtable'
import type { SnapshotPaso } from '@/lib/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => ({}))
  const paso = body?.paso

  if (typeof paso !== 'number' || !Number.isInteger(paso) || paso < 1) {
    return NextResponse.json({ error: 'paso debe ser integer >= 1' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (paso !== entrevista.paso_actual) {
    return NextResponse.json({
      error: `paso=${paso} no coincide con paso_actual=${entrevista.paso_actual}`,
    }, { status: 409 })
  }

  const sub = entrevista.sub_estado_paso ?? 'en_curso'
  if (sub !== 'esperando_aprobacion_final') {
    return NextResponse.json({
      error: `sub_estado_paso debe ser 'esperando_aprobacion_final' para cerrar definitivamente, es '${sub}'`,
    }, { status: 409 })
  }

  // Construir snapshot inmutable con el resumen actual.
  const snapshot: SnapshotPaso = {
    paso,
    proposito: plan.proposito,
    situacion: plan.situacion,
    datos_faltantes: plan.datos_faltantes ?? [],
    cerrado_en: new Date().toISOString(),
  }

  // Persistir snapshot como turno con rol=snapshot.
  const turnos = await getTurnosPE(entrevista.id)
  const indice = turnos.length
  const snapshotTurno = await appendSnapshotTurno(entrevista.id, indice, snapshot)

  // Avanzar paso_actual + reset sub_estado_paso para el siguiente Paso.
  // No usamos updateSubEstadoPaso porque la transición esperando_aprobacion_final
  // → completo es válida pero después necesitamos pasar de completo a en_curso
  // (terminal → fresh) que NO es válida en la máquina. Hacemos directo.
  await updateEntrevistaPE(entrevista.id, {
    sub_estado_paso: 'completo',
    paso_actual: paso + 1,
  })
  await updateEntrevistaPE(entrevista.id, { sub_estado_paso: 'en_curso' })

  console.log('[cerrar-paso-final]', JSON.stringify({
    event: 'paso_cerrado_definitivamente',
    plan_id: planId,
    entrevista_id: entrevista.id,
    paso,
    snapshot_turno_id: snapshotTurno.id,
    proximo_paso: paso + 1,
  }))

  return NextResponse.json({
    ok: true,
    snapshot_turno_id: snapshotTurno.id,
    redirect: `/planes-estrategicos/${planId}/entrevista`,
  })
}
