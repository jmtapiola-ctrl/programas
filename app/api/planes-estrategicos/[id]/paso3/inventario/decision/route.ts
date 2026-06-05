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
// Body modo "renombrar_categoria": { renombrar_categoria: { vieja: string, nueva: string } } — actualiza categoria en todos los movs + resumen.
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
    | { renombrar_categoria: { vieja: string; nueva: string } }
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

    const original = movimientos[idx]
    const patch = body.patch ?? {}

    // Validaciones pre-merge para dependencias.
    const newPrecondiciones = patch.precondiciones ?? original.precondiciones ?? []
    const newDesbloquea = patch.desbloquea ?? original.desbloquea ?? []
    // Self-reference
    if (newPrecondiciones.includes(original.id) || newDesbloquea.includes(original.id)) {
      return NextResponse.json({
        error: `Un movimiento no puede tener su propio id en precondiciones o desbloquea.`,
      }, { status: 409 })
    }
    // Mutual exclusion entre precondiciones y desbloquea del mismo mov
    const overlap = newPrecondiciones.filter(id => newDesbloquea.includes(id))
    if (overlap.length > 0) {
      return NextResponse.json({
        error: `IDs ${overlap.join(', ')} no pueden estar en precondiciones Y desbloquea del mismo movimiento.`,
      }, { status: 409 })
    }

    // Aplicar el patch al mov actual.
    movimientos[idx] = {
      ...original,
      ...patch,
      estado_usuario: body.estado,
    }

    // ─── Auto-mirror bidireccional ─────────────────────────────────────────
    // Si el patch incluye precondiciones o desbloquea, sincronizamos el lado
    // inverso en los movs target. Garantiza que A.desbloquea(B) ⇔ B.precondiciones(A).
    const movId = original.id
    const oldPrecondiciones = original.precondiciones ?? []
    const oldDesbloquea = original.desbloquea ?? []

    if (patch.precondiciones !== undefined) {
      const added = newPrecondiciones.filter((x: string) => !oldPrecondiciones.includes(x))
      const removed = oldPrecondiciones.filter((x: string) => !newPrecondiciones.includes(x))
      for (const targetId of added) {
        const tIdx = movimientos.findIndex(m => m.id === targetId)
        if (tIdx === -1) continue
        const t = movimientos[tIdx]
        if (!(t.desbloquea ?? []).includes(movId)) {
          movimientos[tIdx] = { ...t, desbloquea: [...(t.desbloquea ?? []), movId] }
        }
      }
      for (const targetId of removed) {
        const tIdx = movimientos.findIndex(m => m.id === targetId)
        if (tIdx === -1) continue
        const t = movimientos[tIdx]
        movimientos[tIdx] = { ...t, desbloquea: (t.desbloquea ?? []).filter(x => x !== movId) }
      }
    }
    if (patch.desbloquea !== undefined) {
      const added = newDesbloquea.filter((x: string) => !oldDesbloquea.includes(x))
      const removed = oldDesbloquea.filter((x: string) => !newDesbloquea.includes(x))
      for (const targetId of added) {
        const tIdx = movimientos.findIndex(m => m.id === targetId)
        if (tIdx === -1) continue
        const t = movimientos[tIdx]
        if (!(t.precondiciones ?? []).includes(movId)) {
          movimientos[tIdx] = { ...t, precondiciones: [...(t.precondiciones ?? []), movId] }
        }
      }
      for (const targetId of removed) {
        const tIdx = movimientos.findIndex(m => m.id === targetId)
        if (tIdx === -1) continue
        const t = movimientos[tIdx]
        movimientos[tIdx] = { ...t, precondiciones: (t.precondiciones ?? []).filter(x => x !== movId) }
      }
    }

    // Auto-default tipo_dependencia: si después del mirror un mov tiene
    // precondiciones pero tipo='ninguna', subirlo a 'sugerida'. Si quedó vacío
    // y tipo != 'ninguna', bajarlo a 'ninguna'.
    movimientos = movimientos.map(m => {
      const tienePrecond = (m.precondiciones ?? []).length > 0
      if (tienePrecond && m.tipo_dependencia === 'ninguna') {
        return { ...m, tipo_dependencia: 'sugerida' as const }
      }
      if (!tienePrecond && m.tipo_dependencia !== 'ninguna') {
        return { ...m, tipo_dependencia: 'ninguna' as const }
      }
      return m
    })
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
  // Modo 4: renombrar una categoría completa — actualiza categoria de TODOS
  // los movimientos que la usaban + el resumen correspondiente. Atómico.
  else if ('renombrar_categoria' in body) {
    const vieja = body.renombrar_categoria.vieja
    const nueva = body.renombrar_categoria.nueva?.trim()
    if (!nueva) {
      return NextResponse.json({ error: 'renombrar_categoria.nueva no puede estar vacía.' }, { status: 400 })
    }
    if (vieja === nueva) {
      return NextResponse.json({ ok: true, inventario_actualizado: inv, no_op: true })
    }
    const movsAfectados = movimientos.filter(m => m.categoria === vieja).length
    if (movsAfectados === 0) {
      return NextResponse.json({ error: `No hay movimientos con categoría "${vieja}".` }, { status: 404 })
    }
    movimientos = movimientos.map(m => m.categoria === vieja ? { ...m, categoria: nueva } : m)
    resumenes = resumenes.map(r => r.categoria === vieja ? { ...r, categoria: nueva } : r)
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
