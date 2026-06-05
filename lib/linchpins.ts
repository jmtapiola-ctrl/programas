// Helpers para detectar y formatear "movimientos palanca" (linchpins) — movs
// con alto out-degree en el DAG de dependencias. Un mov con muchos `desbloquea`
// es un habilitador del plan: liberarlo temprano destraba todo lo que depende
// de él. La métrica nace de 3.A.6 (Secuenciación) y se usa para inyectar
// ranking a los prompts de borrador (3.C) y curado (3.E).
//
// Threshold ≥3 desbloqueos: matchea el badge 🔥 del canvas en DAGSecuenciacion.
// Top-N=5: cap para no saturar el prompt si todo el plan está interconectado.

import type { MovimientoPE } from './types'

export interface Linchpin {
  id: string
  nombre: string
  outDegree: number
}

const LINCHPIN_MIN_OUT_DEGREE = 3
const LINCHPIN_TOP_N = 5

export function detectLinchpins(movsActivos: MovimientoPE[]): Linchpin[] {
  return movsActivos
    .filter(m => (m.desbloquea?.length ?? 0) >= LINCHPIN_MIN_OUT_DEGREE)
    .map(m => ({ id: m.id, nombre: m.nombre, outDegree: m.desbloquea?.length ?? 0 }))
    .sort((a, b) => b.outDegree - a.outDegree)
    .slice(0, LINCHPIN_TOP_N)
}

// Devuelve la sección markdown lista para inyectar en un user message de prompt.
// Si no hay linchpins (plan chico o DAG sin aceptar todavía), devuelve un
// fragmento explícito para que el modelo sepa que la regla NO aplica — mejor
// que omitir la sección y dejar al modelo dudando si la olvidamos.
export function formatLinchpinsSection(movsActivos: MovimientoPE[]): string {
  const tops = detectLinchpins(movsActivos)
  if (tops.length === 0) {
    return `## Movimientos palanca detectados
(Ninguno con out-degree ≥${LINCHPIN_MIN_OUT_DEGREE}. La regla de "palancas a Fase 1" no aplica para este plan.)`
  }
  const lines = tops.map(l => `- ${l.id} "${l.nombre}" — desbloquea ${l.outDegree} movimientos`).join('\n')
  return `## Movimientos palanca detectados (top ${tops.length} por out-degree)
Estos movimientos son los HABILITADORES del plan: cada uno libera ≥${LINCHPIN_MIN_OUT_DEGREE} otros del inventario. Tratalos como Fase 1 salvo justificación dura explícita.

${lines}`
}
