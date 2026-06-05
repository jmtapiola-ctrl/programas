// PATCH /api/planes-estrategicos/[id]/proposito/metrica/renombrar
//
// Renombra una o más métricas del propósito (las "brechas" del plan) con
// cascada bidireccional a:
//   - plan.preparativos.criterio_exito.por_metrica[].metrica
//   - plan.inventario.movimientos[].brechas_atacadas[]
//
// Body: { renames: [{ vieja: string, nueva: string }, ...] }
// Persiste en una sola escritura a Airtable (atomicidad).
//
// Validaciones:
//   - auth requerido
//   - paso_actual >= 2 (no permitir antes de tener propósito)
//   - cada `vieja` debe existir en proposito.metricas
//   - cada `nueva` no vacía (trim)
//   - vieja === nueva → skip (no-op, no es error)
//   - el estado final NO debe tener duplicados (caso A→B y otra ya era B, o A→C y B→C)
//
// Response: { ok, cambios: { metricas_renombradas, criterios_actualizados, movimientos_actualizados },
//             proposito_actualizado, inventario_actualizado? }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PropositorPE, PlanoPE } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as
    | { renames: { vieja: string; nueva: string }[] }
    | null

  if (!body || !Array.isArray(body.renames)) {
    return NextResponse.json({ error: 'Body inválido: se esperaba { renames: [{ vieja, nueva }] }' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual < 2) {
    return NextResponse.json({
      error: `Renombrar brechas requiere paso_actual >= 2. paso_actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  if (!plan.proposito) {
    return NextResponse.json({ error: 'No hay propósito que modificar.' }, { status: 409 })
  }

  // ─── Filtrar no-ops y validar shape de cada rename ───────────────────────
  const renames: { vieja: string; nueva: string }[] = []
  for (const r of body.renames) {
    if (typeof r?.vieja !== 'string' || typeof r?.nueva !== 'string') {
      return NextResponse.json({ error: 'Cada rename debe tener vieja: string y nueva: string.' }, { status: 400 })
    }
    const vieja = r.vieja
    const nueva = r.nueva.trim()
    if (!nueva) {
      return NextResponse.json({ error: `El nuevo nombre no puede estar vacío (rename de "${vieja}").` }, { status: 400 })
    }
    if (vieja === nueva) continue // no-op, skip silenciosamente
    renames.push({ vieja, nueva })
  }

  if (renames.length === 0) {
    return NextResponse.json({
      ok: true,
      cambios: { metricas_renombradas: 0, criterios_actualizados: 0, movimientos_actualizados: 0 },
      proposito_actualizado: plan.proposito,
      inventario_actualizado: plan.plan?.inventario,
      no_op: true,
    })
  }

  // ─── Cada vieja debe existir en proposito.metricas ────────────────────────
  const nombresActuales = new Set(plan.proposito.metricas.map(m => m.metrica))
  for (const r of renames) {
    if (!nombresActuales.has(r.vieja)) {
      return NextResponse.json({
        error: `La brecha "${r.vieja}" no existe en el propósito (renames inválidos).`,
      }, { status: 404 })
    }
  }

  // ─── Uniqueness post-rename: aplicar mentalmente los renames y verificar
  // que no haya duplicados en el set final.
  const renameMap = new Map(renames.map(r => [r.vieja, r.nueva]))
  const nombresFinales = plan.proposito.metricas.map(m => renameMap.get(m.metrica) ?? m.metrica)
  const seen = new Set<string>()
  for (const n of nombresFinales) {
    if (seen.has(n)) {
      return NextResponse.json({
        error: `El rename produciría una brecha duplicada: "${n}". Revisá los nombres antes de confirmar.`,
      }, { status: 409 })
    }
    seen.add(n)
  }

  // ─── Aplicar cascada ─────────────────────────────────────────────────────
  let metricasRenombradas = 0
  const propositoNuevo: PropositorPE = {
    ...plan.proposito,
    metricas: plan.proposito.metricas.map(m => {
      const nueva = renameMap.get(m.metrica)
      if (nueva !== undefined) {
        metricasRenombradas++
        return { ...m, metrica: nueva }
      }
      return m
    }),
  }

  let criteriosActualizados = 0
  let movimientosActualizados = 0
  let planNuevo: PlanoPE | undefined = plan.plan

  if (plan.plan) {
    const planAux: PlanoPE = { ...plan.plan }

    // Cascada: criterio_exito.por_metrica
    if (planAux.preparativos?.criterio_exito?.por_metrica) {
      const porMetrica = planAux.preparativos.criterio_exito.por_metrica
      const porMetricaNueva = porMetrica.map(c => {
        const nueva = renameMap.get(c.metrica)
        if (nueva !== undefined) {
          criteriosActualizados++
          return { ...c, metrica: nueva }
        }
        return c
      })
      planAux.preparativos = {
        ...planAux.preparativos,
        criterio_exito: {
          ...planAux.preparativos.criterio_exito,
          por_metrica: porMetricaNueva,
        },
      }
    }

    // Cascada: inventario.movimientos[].brechas_atacadas[]
    if (planAux.inventario) {
      const movimientosNuevos = planAux.inventario.movimientos.map(m => {
        const brechas = m.brechas_atacadas ?? []
        let cambio = false
        const brechasNuevas = brechas.map(b => {
          const nueva = renameMap.get(b)
          if (nueva !== undefined) {
            cambio = true
            return nueva
          }
          return b
        })
        if (cambio) {
          movimientosActualizados++
          return { ...m, brechas_atacadas: brechasNuevas }
        }
        return m
      })
      planAux.inventario = { ...planAux.inventario, movimientos: movimientosNuevos }
    }

    planNuevo = planAux
  }

  // ─── Persistir en una sola escritura ────────────────────────────────────
  await updatePlanEstrategico(planId, {
    proposito: propositoNuevo,
    ...(planNuevo !== undefined ? { plan: planNuevo } : {}),
  })

  return NextResponse.json({
    ok: true,
    cambios: {
      metricas_renombradas: metricasRenombradas,
      criterios_actualizados: criteriosActualizados,
      movimientos_actualizados: movimientosActualizados,
    },
    proposito_actualizado: propositoNuevo,
    inventario_actualizado: planNuevo?.inventario,
  })
}
