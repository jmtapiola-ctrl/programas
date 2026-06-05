// Helper compartido client/server para computar la "firma" del set de dueños
// activos del inventario. Sirve para detectar si el set cambió entre el último
// review (modal UnificarDuenos en P-4) y el render actual — si la firma es la
// misma, skipeamos el modal.
//
// Convención: dueños activos = de movs cuyo estado_usuario !== 'quitado',
// trimmed, no vacíos. Set ordenado alfabéticamente y concatenado con "|".
// Versión "v1:" para permitir cambios futuros si hace falta.

import type { MovimientoPE } from './types'

export function computeDuenosSignature(movs: MovimientoPE[]): string {
  const set = new Set<string>()
  for (const m of movs) {
    if (m.estado_usuario === 'quitado') continue
    const d = (m.dueno ?? '').trim()
    if (d) set.add(d)
  }
  return `v1:${Array.from(set).sort().join('|')}`
}
