// PATCH /api/planes-estrategicos/[id]/paso3/inventario/decision
//
// Aplica decisiones del usuario a movimientos individuales del inventario
// (estado_usuario: aceptado | editado | quitado). Persiste inmediato a
// Airtable para soportar abandono y recovery (mismo patrón que las decisiones
// del audit-reviewer).
//
// Body modo "single": { movimiento_id: "M-3", estado: "aceptado" | "editado" | "quitado", patch?: Partial<MovimientoPE> }
// Body modo "agregar": { agregar: { categoria: string, movimiento: MovimientoPE (sin id, el server lo asigna) } }
// Body modo "categoria_resumen": { categoria: "Cobertura geográfica", aceptados: 3, editados: 1, quitados: 0 }
//
// Response: { ok: true, inventario_actualizado: InventarioPE }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { MovimientoPE, PlanoPE } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as
    | { movimiento_id: string; estado: 'aceptado' | 'editado' | 'quitado'; patch?: Partial<MovimientoPE> }
    | { agregar: { categoria: string; movimiento: Omit<MovimientoPE, 'id'> } }
    | { categoria: string; aceptados: number; editados: number; quitados: number }
    | null

  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({
      error: `Decisiones de inventario solo durante Paso 3. paso_actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  if (!plan.plan?.inventario) {
    return NextResponse.json({
      error: 'No hay inventario que modificar. Generalo primero con POST /paso3/inventario/generar.',
    }, { status: 409 })
  }

  const inv = plan.plan.inventario
  let movimientos = [...inv.movimientos]
  let resumenes = inv.resumenes_categoria ? [...inv.resumenes_categoria] : []

  // Modo 1: decisión sobre un movimiento existente
  if ('movimiento_id' in body) {
    const idx = movimientos.findIndex(m => m.id === body.movimiento_id)
    if (idx === -1) {
      return NextResponse.json({
        error: `movimiento_id "${body.movimiento_id}" no existe en el inventario.`,
      }, { status: 404 })
    }
    movimientos[idx] = {
      ...movimientos[idx],
      ...(body.patch ?? {}),
      estado_usuario: body.estado,
    }
  }
  // Modo 2: agregar movimiento custom del usuario
  else if ('agregar' in body) {
    // Generar id único: M-N donde N es el siguiente entero después del max actual
    const maxN = movimientos.reduce((max, m) => {
      const n = parseInt(m.id.replace(/^M-/, ''), 10)
      return Number.isFinite(n) && n > max ? n : max
    }, 0)
    const newMov: MovimientoPE = {
      id: `M-${maxN + 1}`,
      ...body.agregar.movimiento,
      categoria: body.agregar.categoria,
      estado_usuario: 'aceptado', // movimientos custom arrancan ya aceptados
    }
    movimientos.push(newMov)
  }
  // Modo 3: actualizar resumen de categoría (cuando el usuario cierra una categoría)
  else if ('categoria' in body) {
    const idx = resumenes.findIndex(r => r.categoria === body.categoria)
    const totalCategoria = movimientos.filter(m => m.categoria === body.categoria).length
    const resumen = {
      categoria: body.categoria,
      total: totalCategoria,
      aceptados: body.aceptados,
      editados: body.editados,
      quitados: body.quitados,
    }
    if (idx === -1) resumenes.push(resumen)
    else resumenes[idx] = resumen
  } else {
    return NextResponse.json({ error: 'Body no matchea ningún modo válido (movimiento_id, agregar, o categoria).' }, { status: 400 })
  }

  // Persistir
  const planActualizado: PlanoPE = {
    ...plan.plan,
    inventario: {
      ...inv,
      movimientos,
      resumenes_categoria: resumenes,
    },
  }
  await updatePlanEstrategico(planId, { plan: planActualizado })

  return NextResponse.json({
    ok: true,
    inventario_actualizado: planActualizado.inventario,
  })
}
