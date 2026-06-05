// POST /api/planes-estrategicos/[id]/paso3/dag/aceptar
//
// Aplica el DAG completo propuesto por Opus al inventario:
//   1. SOBREESCRIBE todas las precondiciones existentes (limpia primero).
//   2. Aplica las nuevas dependencias con tipo per-edge + auto-mirror.
//   3. Persiste el DAG (inventario.dag) con TODOS los movs activos del
//      inventario y sus posiciones dagre.
//
// Es destructivo: el frontend muestra confirm explícito antes de invocar.
//
// Body: { dependencias: Array<{desde, hacia, tipo, razonamiento?}> }
// Response: { ok, inventario_actualizado }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PlanoPE, MovimientoPE, DAGPlanPE } from '@/lib/types'
import { normalizeDepTipoEdge } from '@/lib/types'
import dagre from 'dagre'

interface DependenciaInput {
  desde: string
  hacia: string
  tipo: 'sugerida' | 'ff' | 'fs' | 'continuo' | 'dura' | 'blanda'
  razonamiento?: string
  // Lag por edge en meses. Aplica a FS/FF/continuo (ignorado en 'sugerida').
  // Default 0 si ausente. Validación rechaza valores < 0.
  lag_meses?: number
}

const NODE_W = 240
const NODE_H = 76

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as { dependencias?: DependenciaInput[] } | null
  if (!body || !Array.isArray(body.dependencias)) {
    return NextResponse.json({ error: 'Body inválido: se esperaba { dependencias: [...] }.' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({
      error: `Aceptar DAG solo durante Paso 3. paso_actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  const inv = plan.plan?.inventario
  if (!inv) return NextResponse.json({ error: 'No hay inventario.' }, { status: 409 })

  // ─── Validar input ───────────────────────────────────────────────────────
  const movsActivos = inv.movimientos.filter(m => m.estado_usuario !== 'quitado')
  const idsActivos = new Set(movsActivos.map(m => m.id))
  for (const d of body.dependencias) {
    if (!d?.desde || !d?.hacia || d.desde === d.hacia) {
      return NextResponse.json({ error: `Dependencia inválida: ${JSON.stringify(d)}.` }, { status: 400 })
    }
    if (!idsActivos.has(d.desde) || !idsActivos.has(d.hacia)) {
      return NextResponse.json({ error: `Dependencia ${d.desde}→${d.hacia} usa movs inexistentes o quitados.` }, { status: 400 })
    }
    if (d.tipo !== 'sugerida' && d.tipo !== 'ff' && d.tipo !== 'fs' && d.tipo !== 'continuo' && d.tipo !== 'dura' && d.tipo !== 'blanda') {
      return NextResponse.json({ error: `Tipo inválido "${d.tipo}" en ${d.desde}→${d.hacia}.` }, { status: 400 })
    }
    if (d.lag_meses !== undefined && (typeof d.lag_meses !== 'number' || !Number.isFinite(d.lag_meses) || d.lag_meses < 0)) {
      return NextResponse.json({ error: `lag_meses inválido en ${d.desde}→${d.hacia}: debe ser number >= 0.` }, { status: 400 })
    }
  }

  // ─── 1. Limpiar TODAS las precondiciones existentes ──────────────────────
  // (Sobreescritura destructiva — el frontend ya confirmó con el user.)
  // Para los movs quitados: no los tocamos, sus deps históricas siguen.
  const movsActualizados: MovimientoPE[] = inv.movimientos.map(m => {
    if (m.estado_usuario === 'quitado') {
      return { ...m, precondiciones: [...(m.precondiciones ?? [])], desbloquea: [...(m.desbloquea ?? [])] }
    }
    return {
      ...m,
      precondiciones: [],
      desbloquea: [],
      precondiciones_tipo: undefined,
      precondiciones_razonamiento: undefined,
      precondiciones_lag_meses: undefined,
      tipo_dependencia: 'ninguna' as const,
      // Re-proponer estructuralmente sobreescribe deps → la validación que
      // el user había hecho queda stale. Wipear todos los flags para forzar
      // re-revisión del nuevo modelo.
      deps_validadas: false,
    }
  })

  // ─── 2. Aplicar las nuevas dependencias ──────────────────────────────────
  const movsById = new Map(movsActualizados.map(m => [m.id, m]))
  for (const d of body.dependencias) {
    const target = movsById.get(d.hacia)
    const source = movsById.get(d.desde)
    if (!target || !source) continue
    if (!target.precondiciones.includes(d.desde)) target.precondiciones.push(d.desde)
    const tipoNorm = normalizeDepTipoEdge(d.tipo)
    target.precondiciones_tipo = { ...(target.precondiciones_tipo ?? {}), [d.desde]: tipoNorm }
    if (d.razonamiento && d.razonamiento.trim()) {
      target.precondiciones_razonamiento = {
        ...(target.precondiciones_razonamiento ?? {}),
        [d.desde]: d.razonamiento.trim(),
      }
    }
    // Lag: solo persistir si > 0 y tipo no-sugerida.
    const lag = Math.max(0, Math.floor(d.lag_meses ?? 0))
    if (lag > 0 && tipoNorm !== 'sugerida') {
      target.precondiciones_lag_meses = {
        ...(target.precondiciones_lag_meses ?? {}),
        [d.desde]: lag,
      }
    }
    if (!source.desbloquea.includes(d.hacia)) source.desbloquea.push(d.hacia)
    if (target.tipo_dependencia === 'ninguna' && target.precondiciones.length > 0) {
      target.tipo_dependencia = 'sugerida'
    }
  }

  // Cleanup: remover maps vacíos.
  for (const m of movsActualizados) {
    if (m.precondiciones_tipo && Object.keys(m.precondiciones_tipo).length === 0) {
      delete m.precondiciones_tipo
    }
    if (m.precondiciones_razonamiento && Object.keys(m.precondiciones_razonamiento).length === 0) {
      delete m.precondiciones_razonamiento
    }
    if (m.precondiciones_lag_meses && Object.keys(m.precondiciones_lag_meses).length === 0) {
      delete m.precondiciones_lag_meses
    }
  }

  // ─── 3. Calcular dagre layout para TODOS los movs activos + sus deps ─────
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 130, marginx: 30, marginy: 30 })
  movsActivos.forEach(m => g.setNode(m.id, { width: NODE_W, height: NODE_H }))
  body.dependencias.forEach(d => g.setEdge(d.desde, d.hacia))
  dagre.layout(g)

  const ahora = new Date().toISOString()
  const dagNuevo: DAGPlanPE = {
    movs: movsActivos.map(m => {
      const pos = g.node(m.id)
      return {
        mov_id: m.id,
        x: (pos?.x ?? 0) - NODE_W / 2,
        y: (pos?.y ?? 0) - NODE_H / 2,
      }
    }),
    generado_en: ahora,
  }

  // ─── 4. Persistir todo en una sola escritura ────────────────────────────
  const planActualizado: PlanoPE = {
    ...plan.plan,
    inventario: {
      ...inv,
      movimientos: movsActualizados,
      dag: dagNuevo,
    },
  }

  await updatePlanEstrategico(planId, { plan: planActualizado })

  console.log('[paso3/dag/aceptar] done', JSON.stringify({
    deps_aplicadas: body.dependencias.length,
    movs_activos: movsActivos.length,
  }))

  return NextResponse.json({
    ok: true,
    inventario_actualizado: planActualizado.inventario,
  })
}
