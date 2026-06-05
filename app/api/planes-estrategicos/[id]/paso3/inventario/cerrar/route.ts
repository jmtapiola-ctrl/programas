// POST /api/planes-estrategicos/[id]/paso3/inventario/cerrar
//
// Cierre formal del Sub-bloque 3.A. Crea snapshot intermedio + actualiza
// sub_bloque_actual a '3.B'. Se llama desde el componente InventarioCategoria
// cuando el usuario cierra la última categoría del inventario.
//
// Por qué no via modelo (cierre_sugerido=true): el flow de 3.A es 100%
// determinístico (modal del cliente, no chat conversacional), entonces
// disparamos el cierre directo desde el cliente. Más confiable que esperar
// que el modelo emita correctamente.
//
// Validaciones:
// - paso_actual=3 + sub_bloque_actual='3.A'
// - plan.inventario existe + todos los movimientos tienen estado_usuario != 'pendiente'
//
// Side effects:
// - Crea turno snapshot en Turnos_PE con paso=3, plan.preparativos + plan.inventario
// - Actualiza sub_bloque_actual='3.B' en entrevistas_pe
// - sub_estado_paso sigue en 'en_curso' (cierre interno, no externo)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  appendSnapshotTurno,
  updateEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { SnapshotPaso } from '@/lib/types'

export async function POST(
  req: NextRequest,
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

  // Validaciones
  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({ error: `Esperado paso_actual=3, got ${entrevista.paso_actual}.` }, { status: 409 })
  }
  if (entrevista.sub_bloque_actual !== '3.A') {
    return NextResponse.json({ error: `Esperado sub_bloque_actual='3.A', got '${entrevista.sub_bloque_actual}'.` }, { status: 409 })
  }
  const inv = plan.plan?.inventario
  if (!inv) {
    return NextResponse.json({ error: 'No hay inventario que cerrar.' }, { status: 409 })
  }
  const pendientes = inv.movimientos.filter(m => m.estado_usuario === 'pendiente')
  if (pendientes.length > 0) {
    return NextResponse.json({
      error: `Faltan ${pendientes.length} movimiento(s) sin decisión: ${pendientes.map(m => m.id).join(', ')}.`,
    }, { status: 409 })
  }

  // Recomputar resumenes_categoria desde el estado final de los movimientos.
  // El usuario puede haber navegado entre categorías con "Siguiente"/"Volver"
  // sin gatillar "Cerrar categoría y avanzar" (que es lo que normalmente
  // actualiza el resumen). Acá lo derivamos del estado ground-truth para
  // garantizar coherencia, sin importar cómo se navegó.
  const categoriasUnicas = Array.from(new Set(inv.movimientos.map(m => m.categoria)))
  const resumenesRecomputados = categoriasUnicas.map(categoria => {
    const movs = inv.movimientos.filter(m => m.categoria === categoria)
    return {
      categoria,
      total: movs.length,
      aceptados: movs.filter(m => m.estado_usuario === 'aceptado').length,
      editados: movs.filter(m => m.estado_usuario === 'editado').length,
      quitados: movs.filter(m => m.estado_usuario === 'quitado').length,
    }
  })
  const planConResumenes = {
    ...plan.plan,
    inventario: {
      ...inv,
      resumenes_categoria: resumenesRecomputados,
    },
  }
  await updatePlanEstrategico(planId, { plan: planConResumenes })

  // Snapshot intermedio del Paso 3 con plan.inventario completo.
  // cierre_tipo='intermedio_sub_bloque_3.A' marca este snapshot como cierre
  // de sub-bloque (NO del Paso entero) para que el wrapper del LLM en turnos
  // futuros lo etiquete correctamente y el modelo no alucine "Paso 3 cerrado".
  const snapshot: SnapshotPaso = {
    paso: 3,
    proposito: plan.proposito,
    situacion: plan.situacion,
    datos_faltantes: plan.datos_faltantes ?? [],
    plan: planConResumenes,
    cerrado_en: new Date().toISOString(),
    cierre_tipo: 'intermedio_sub_bloque_3.A',
  }
  const indiceSnapshot = entrevista.historial.length
  await appendSnapshotTurno(entrevista.id, indiceSnapshot, snapshot)

  // Avanzar sub_bloque a 3.B
  await updateEntrevistaPE(entrevista.id, { sub_bloque_actual: '3.B' })

  console.log('[paso3/inventario/cerrar]', JSON.stringify({
    plan_id: planId,
    movimientos_total: inv.movimientos.length,
    movimientos_aceptados: inv.movimientos.filter(m => m.estado_usuario === 'aceptado').length,
    movimientos_editados: inv.movimientos.filter(m => m.estado_usuario === 'editado').length,
    movimientos_quitados: inv.movimientos.filter(m => m.estado_usuario === 'quitado').length,
    nuevo_sub_bloque: '3.B',
  }))

  return NextResponse.json({
    ok: true,
    sub_bloque_actual: '3.B',
    snapshot_creado: true,
  })
}
