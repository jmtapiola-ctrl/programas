// PUT /api/planes-estrategicos/[id]/proposito/metrica/editar
//
// Editor COMPLETO de las brechas (proposito.metricas): permite renombrar,
// editar valores (objetivo/actual), AGREGAR y BORRAR brechas en una sola
// operación. Es el superset del endpoint /renombrar (que solo renombra).
//
// El body trae la lista FINAL DESEADA de brechas. Cada fila lleva `original`
// (el nombre previo, para mapear renames y cascada) o `null` si es nueva.
// El endpoint computa el diff (renames / altas / bajas / cambios de valor) y
// aplica la cascada bidireccional a:
//   - plan.preparativos.criterio_exito.por_metrica[]  (rename + baja; alta → entry nueva)
//   - plan.inventario.movimientos[].brechas_atacadas[] (rename + baja)
//
// Body: { brechas: [{ original: string | null, metrica: string,
//                      valor_objetivo: string, valor_actual: string }, ...] }
// Persiste en una sola escritura a Airtable (atomicidad).
//
// Validaciones:
//   - auth requerido
//   - paso_actual >= 2 (no permitir antes de tener propósito)
//   - cada `original` no-null debe existir en proposito.metricas
//   - cada `metrica` (nombre final) no vacía (trim)
//   - el estado final NO debe tener nombres duplicados
//   - debe quedar al menos 1 brecha
//
// Response: { ok, cambios: { renombradas, agregadas, borradas, valores_editados,
//             criterios_actualizados, movimientos_actualizados },
//             movimientos_huerfanos: string[],  // ids de movs que quedaron sin ninguna brecha
//             proposito_actualizado, inventario_actualizado? }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PropositorPE, PlanoPE, MetricaPE, CriterioExitoMetricaPE } from '@/lib/types'

interface FilaBrechaInput {
  original: string | null
  metrica: string
  valor_objetivo: string
  valor_actual: string
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as { brechas: FilaBrechaInput[] } | null

  if (!body || !Array.isArray(body.brechas)) {
    return NextResponse.json({ error: 'Body inválido: se esperaba { brechas: [{ original, metrica, valor_objetivo, valor_actual }] }' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual < 2) {
    return NextResponse.json({
      error: `Editar brechas requiere paso_actual >= 2. paso_actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  if (!plan.proposito) {
    return NextResponse.json({ error: 'No hay propósito que modificar.' }, { status: 409 })
  }

  // ─── Normalizar y validar cada fila ──────────────────────────────────────
  const filas: FilaBrechaInput[] = []
  for (const f of body.brechas) {
    if (typeof f?.metrica !== 'string') {
      return NextResponse.json({ error: 'Cada brecha debe tener metrica: string.' }, { status: 400 })
    }
    const original = (f.original === null || f.original === undefined) ? null
      : (typeof f.original === 'string' ? f.original : null)
    const metrica = f.metrica.trim()
    if (!metrica) {
      return NextResponse.json({ error: 'El nombre de la brecha no puede estar vacío.' }, { status: 400 })
    }
    filas.push({
      original,
      metrica,
      valor_objetivo: typeof f.valor_objetivo === 'string' ? f.valor_objetivo.trim() : '',
      valor_actual: typeof f.valor_actual === 'string' ? f.valor_actual.trim() : '',
    })
  }

  if (filas.length === 0) {
    return NextResponse.json({ error: 'Debe quedar al menos 1 brecha. No se puede vaciar el propósito.' }, { status: 409 })
  }

  // ─── Cada `original` no-null debe existir hoy ────────────────────────────
  const nombresActuales = new Set(plan.proposito.metricas.map(m => m.metrica))
  for (const f of filas) {
    if (f.original !== null && !nombresActuales.has(f.original)) {
      return NextResponse.json({
        error: `La brecha "${f.original}" no existe en el propósito (referencia inválida).`,
      }, { status: 404 })
    }
  }

  // ─── No duplicar `original` (dos filas no pueden referir a la misma brecha) ─
  const origVistos = new Set<string>()
  for (const f of filas) {
    if (f.original !== null) {
      if (origVistos.has(f.original)) {
        return NextResponse.json({ error: `Dos filas referencian la misma brecha original "${f.original}".` }, { status: 409 })
      }
      origVistos.add(f.original)
    }
  }

  // ─── Sin nombres finales duplicados ──────────────────────────────────────
  const seen = new Set<string>()
  for (const f of filas) {
    if (seen.has(f.metrica)) {
      return NextResponse.json({
        error: `Hay dos brechas con el mismo nombre: "${f.metrica}". Los nombres deben ser únicos.`,
      }, { status: 409 })
    }
    seen.add(f.metrica)
  }

  // ─── Computar diff ───────────────────────────────────────────────────────
  // renameMap: nombre viejo → nombre nuevo (solo cuando cambió)
  const renameMap = new Map<string, string>()
  let renombradas = 0
  let agregadas = 0
  let valoresEditados = 0
  const metricasPrevPorNombre = new Map(plan.proposito.metricas.map(m => [m.metrica, m]))

  for (const f of filas) {
    if (f.original === null) {
      agregadas++
      continue
    }
    if (f.original !== f.metrica) {
      renameMap.set(f.original, f.metrica)
      renombradas++
    }
    const prev = metricasPrevPorNombre.get(f.original)
    if (prev && (prev.valor_objetivo !== f.valor_objetivo || prev.valor_actual !== f.valor_actual)) {
      valoresEditados++
    }
  }

  // borradas: brechas actuales cuyo nombre NO está entre los `original` que sobreviven
  const originalesQueSobreviven = new Set(filas.filter(f => f.original !== null).map(f => f.original as string))
  const borradasNombres = plan.proposito.metricas
    .map(m => m.metrica)
    .filter(nombre => !originalesQueSobreviven.has(nombre))
  const borradasSet = new Set(borradasNombres)

  // ─── Construir el nuevo propósito (las filas SON el estado final) ────────
  const metricasNuevas: MetricaPE[] = filas.map(f => ({
    metrica: f.metrica,
    valor_objetivo: f.valor_objetivo,
    valor_actual: f.valor_actual,
  }))
  const propositoNuevo: PropositorPE = { ...plan.proposito, metricas: metricasNuevas }

  // ─── Cascada al plan (criterios + inventario) ────────────────────────────
  let criteriosActualizados = 0
  let movimientosActualizados = 0
  const movimientosHuerfanos: string[] = []
  let planNuevo: PlanoPE | undefined = plan.plan

  if (plan.plan) {
    const planAux: PlanoPE = { ...plan.plan }

    // Cascada: criterio_exito.por_metrica (rename + baja + alta)
    if (planAux.preparativos?.criterio_exito?.por_metrica) {
      const porMetrica = planAux.preparativos.criterio_exito.por_metrica
      // 1) rename + baja sobre los existentes
      const sobrevivientes = porMetrica
        .filter(c => !borradasSet.has(c.metrica))
        .map(c => {
          const nueva = renameMap.get(c.metrica)
          if (nueva !== undefined) {
            criteriosActualizados++
            return { ...c, metrica: nueva }
          }
          return c
        })
      // 2) alta: por cada brecha nueva (original===null) que no tenga entry, crear una
      const nombresConCriterio = new Set(sobrevivientes.map(c => c.metrica))
      const altas: CriterioExitoMetricaPE[] = filas
        .filter(f => f.original === null && !nombresConCriterio.has(f.metrica))
        .map(f => ({ metrica: f.metrica, pleno: f.valor_objetivo, minimo: '' }))
      planAux.preparativos = {
        ...planAux.preparativos,
        criterio_exito: {
          ...planAux.preparativos.criterio_exito,
          por_metrica: [...sobrevivientes, ...altas],
        },
      }
    }

    // Cascada: inventario.movimientos[].brechas_atacadas (rename + baja)
    if (planAux.inventario) {
      const movimientosNuevos = planAux.inventario.movimientos.map(m => {
        const brechas = m.brechas_atacadas ?? []
        if (brechas.length === 0) return m
        let cambio = false
        const brechasNuevas: string[] = []
        for (const b of brechas) {
          if (borradasSet.has(b)) { cambio = true; continue } // baja: drop
          const nueva = renameMap.get(b)
          if (nueva !== undefined) { cambio = true; brechasNuevas.push(nueva) }
          else brechasNuevas.push(b)
        }
        if (cambio) {
          movimientosActualizados++
          // Si quedó sin ninguna brecha y antes tenía, marcar huérfano (solo movs activos)
          if (brechasNuevas.length === 0 && m.estado_usuario !== 'quitado') {
            movimientosHuerfanos.push(m.id)
          }
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
      renombradas,
      agregadas,
      borradas: borradasNombres.length,
      valores_editados: valoresEditados,
      criterios_actualizados: criteriosActualizados,
      movimientos_actualizados: movimientosActualizados,
    },
    movimientos_huerfanos: movimientosHuerfanos,
    proposito_actualizado: propositoNuevo,
    inventario_actualizado: planNuevo?.inventario,
  })
}
