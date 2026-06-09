// PATCH /api/planes-estrategicos/[id]/draft/inventario-directo
//
// Edición DIRECTA del inventario del borrador (F4 — canvas/duraciones): aplica
// movimientos de nodos del DAG (posiciones), cambios de dependencias, y edición
// de campos del mov (ej duración) SIN pasar por el chat. Cada edición se aplica
// al borrador y queda en el trail de cambios de inventario. Recomputa CPM.
//
// Body: { posiciones?: Record<movId, {x,y}>, mov_cambios?: DraftMovCambio[] }
// Response: { ok, draft, aplicados, warnings, cierre }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { getPlanDraft, updatePlanDraft } from '@/lib/airtable'
import { aplicarMovCambios } from '@/lib/draft-mov-apply'
import { computeSchedule, faseDeFecha, buildFaseDisplayLabel } from '@/lib/computeSchedule'
import type { DraftMovCambio } from '@/lib/types'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const access = await checkPlanAccess(session.user as any, planId)
  if (!access.allowed) return NextResponse.json({ error: access.error ?? 'Sin acceso' }, { status: access.status ?? 403 })

  const body = await req.json().catch(() => ({}))
  const posiciones: Record<string, { x: number; y: number }> = body?.posiciones ?? {}
  const movCambios: DraftMovCambio[] = Array.isArray(body?.mov_cambios) ? body.mov_cambios : []

  const draft = await getPlanDraft(planId)
  if (!draft) return NextResponse.json({ error: 'No hay borrador.' }, { status: 409 })
  if (!draft.inventario) return NextResponse.json({ error: 'El borrador no tiene inventario.' }, { status: 409 })

  const warnings: string[] = []
  let aplicados = 0

  // 1. Posiciones del DAG (drag de nodos). No cuentan como "cambio" de contenido
  //    (son layout), pero se persisten para que el mapa quede como lo dejó el user.
  if (Object.keys(posiciones).length > 0) {
    const dag = draft.inventario.dag ?? { movs: [], generado_en: '' }
    const byId = new Map((dag.movs ?? []).map(m => [m.mov_id, m]))
    for (const [movId, pos] of Object.entries(posiciones)) {
      const existing = byId.get(movId)
      if (existing) { existing.x = pos.x; existing.y = pos.y }
      else { dag.movs = dag.movs ?? []; dag.movs.push({ mov_id: movId, x: pos.x, y: pos.y }); byId.set(movId, dag.movs[dag.movs.length - 1]) }
    }
    draft.inventario.dag = dag
  }

  // 2. Cambios de mov (dependencias, duración, etc) — cuentan como cambio real.
  if (movCambios.length > 0) {
    const r = aplicarMovCambios(draft.inventario, movCambios)
    draft.inventario = r.inventario
    draft.cambios_inventario_aplicados = [...(draft.cambios_inventario_aplicados ?? []), ...movCambios]
    aplicados = r.aplicados
    warnings.push(...r.warnings)
  }

  draft.actualizado_en = new Date().toISOString()
  await updatePlanDraft(planId, draft)

  return NextResponse.json({ ok: true, draft, aplicados, warnings, cierre: cierreRecomputado(draft.inventario?.movimientos) })
}

function cierreRecomputado(movs: any[] | undefined): string | null {
  if (!movs?.length) return null
  const sched = computeSchedule(movs as any)
  if (sched.size === 0) return null
  let latest: { termina: Date; ym: string } | null = null
  for (const s of sched.values()) {
    if (!latest || s.termina.getTime() > latest.termina.getTime()) latest = { termina: s.termina, ym: s.terminaYM }
  }
  return latest ? `${latest.ym} (${buildFaseDisplayLabel(faseDeFecha(latest.termina).key)})` : null
}
