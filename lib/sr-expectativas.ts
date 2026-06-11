// Congela las EXPECTATIVAS REALES del Sr sobre los movimientos heredados por un
// Plan Jr (Fase: detección de desvíos Jr↔Sr).
//
// Problema: el snapshot heredado guarda los movimientos del Sr con `ventana_temporal`
// VACÍO (es un campo legacy/derivado; el cronograma real se computa por CPM en vivo).
// Como el chat del Jr NO tiene acceso al Sr (planSr=null, por confidencialidad), el
// cronograma esperado por el Sr debe **materializarse al desplegar** — único momento
// donde el inventario Sr completo es accesible.
//
// Este helper, al desplegar (o en el backfill), computa el CPM del inventario Sr
// COMPLETO (no el subconjunto — eso perdería dependencias cross-mov) y, por cada mov
// heredado, congela:
//   - ventana_temporal = { arranca, termina } con la fecha CPM real → arregla a la vez
//     el render del contexto del Jr y el baseline temporal del cap.
//   - sr_desbloquea_total = nº de movs del Sr que dependen de este (transitivo) → rol
//     crítico / prerequisite.

import type { MovimientoPE } from './types'
import { computeSchedule } from './computeSchedule'

// Cuenta transitiva de movimientos aguas abajo (vía `desbloquea`) en el inventario Sr.
function desbloqueoTransitivo(movId: string, byId: Map<string, MovimientoPE>): number {
  const visto = new Set<string>()
  const cola = [...(byId.get(movId)?.desbloquea ?? [])]
  while (cola.length) {
    const id = cola.shift()!
    if (visto.has(id) || !byId.has(id)) continue
    visto.add(id)
    for (const d of byId.get(id)?.desbloquea ?? []) cola.push(d)
  }
  return visto.size
}

// Devuelve el snapshot enriquecido (copia) con ventana_temporal (CPM real del Sr) +
// sr_desbloquea_total por cada mov heredado. No muta los inputs.
export function congelarExpectativasSr(
  snapshot: MovimientoPE[],
  inventarioSrCompleto: MovimientoPE[],
  baseDate: Date = new Date(),
): MovimientoPE[] {
  const activos = inventarioSrCompleto.filter(m => m.estado_usuario !== 'quitado')
  const sched = computeSchedule(activos, baseDate)
  const byId = new Map(activos.map(m => [m.id, m]))
  return snapshot.map(m => {
    const s = sched.get(m.id)
    const out: MovimientoPE = { ...m }
    if (s) out.ventana_temporal = { arranca: s.arrancaYM, termina: s.terminaYM }
    out.sr_desbloquea_total = desbloqueoTransitivo(m.id, byId)
    return out
  })
}
