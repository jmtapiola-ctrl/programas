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
  // cierre_tipo='formal_paso' indica cierre del Paso entero post audit-reviewer,
  // a diferencia de los snapshots intermedios (sub_bloque_3.0, 3.A) creados
  // por el chat route. El wrapper del LLM usa esta marca para etiquetar el
  // snapshot al modelo en turnos futuros.
  const snapshot: SnapshotPaso = {
    paso,
    proposito: plan.proposito,
    situacion: plan.situacion,
    datos_faltantes: plan.datos_faltantes ?? [],
    cerrado_en: new Date().toISOString(),
    cierre_tipo: 'formal_paso',
  }

  // Persistir snapshot como turno con rol=snapshot.
  const turnos = await getTurnosPE(entrevista.id)
  const indice = turnos.length
  const snapshotTurno = await appendSnapshotTurno(entrevista.id, indice, snapshot)

  // Avanzar paso_actual + reset sub_estado_paso + reset sub_bloque_actual al
  // primer sub-bloque del siguiente Paso.
  //
  // ROOT CAUSE FIX (2026-05-11): antes solo se incrementaba paso_actual sin
  // resetear sub_bloque_actual. Al cerrar Paso N, el sub_bloque quedaba en el
  // último sub-bloque del Paso N (ej: 2.G al cerrar Paso 2) cuando paso_actual
  // ya era N+1. El modelo al arrancar el siguiente Paso leía paso=N+1 +
  // sub_bloque del paso anterior → confusión. Detectado en pre-arranque del
  // Plan Sr Terravinci real, donde sub_bloque_actual quedó en '2.G' tras
  // cerrar Paso 2 en lugar de '3.0'.
  //
  // No usamos updateSubEstadoPaso porque la transición esperando_aprobacion_final
  // → completo es válida pero después necesitamos pasar de completo a en_curso
  // (terminal → fresh) que NO es válida en la máquina. Hacemos directo.
  const proximoPaso = paso + 1
  const proximoSubBloque = firstSubBloqueDelPaso(proximoPaso)
  const updatesPaso: Parameters<typeof updateEntrevistaPE>[1] = {
    sub_estado_paso: 'completo',
    paso_actual: proximoPaso,
  }
  if (proximoSubBloque !== null) {
    updatesPaso.sub_bloque_actual = proximoSubBloque
  }
  await updateEntrevistaPE(entrevista.id, updatesPaso)
  await updateEntrevistaPE(entrevista.id, { sub_estado_paso: 'en_curso' })

  console.log('[cerrar-paso-final]', JSON.stringify({
    event: 'paso_cerrado_definitivamente',
    plan_id: planId,
    entrevista_id: entrevista.id,
    paso,
    snapshot_turno_id: snapshotTurno.id,
    proximo_paso: proximoPaso,
    proximo_sub_bloque: proximoSubBloque,
  }))

  return NextResponse.json({
    ok: true,
    snapshot_turno_id: snapshotTurno.id,
    redirect: `/planes-estrategicos/${planId}/entrevista`,
  })
}

// Mapea cada paso a su primer sub-bloque. Usado para resetear sub_bloque_actual
// al cerrar formalmente el paso anterior, evitando que quede en el último
// sub-bloque del paso cerrado y confunda al modelo en el siguiente turno.
//
// Convención:
//   - Paso 0 = Encuadre, sub-bloque inicial '0' (placeholder, sin sub-bloques formales).
//   - Paso 1 = Propósito, sub-bloques 1.A..1.E.
//   - Paso 2 = Situación, sub-bloques 2.A..2.G.
//   - Paso 3 = Plan, sub-bloques 3.0..3.E.
//   - Paso 4+ = no implementado actualmente. Marcamos 'completado' como terminal
//     hasta que se sume el cuestionario de Paso 4 (sub-bloques 4.X).
//   - Paso > 4 = null (devuelve null para preservar el sub_bloque actual sin
//     pisarlo con un valor inventado).
function firstSubBloqueDelPaso(paso: number): string | null {
  switch (paso) {
    case 0: return '0'
    case 1: return '1.A'
    case 2: return '2.A'
    case 3: return '3.0'
    case 4: return 'completado'  // Terminal — wizard hasta donde está implementado.
    default: return null
  }
}
