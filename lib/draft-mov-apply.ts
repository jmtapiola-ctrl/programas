// Apply de cambios de inventario sobre el borrador (F3 — edición de planes
// cerrados). Muta campos escalares/texto de un movimiento o sus dependencias
// (precondiciones). El cronograma (Gantt) se deriva de duraciones + dependencias
// vía lib/computeSchedule.ts, así que NO se persiste nada de schedule: se
// recalcula en render.
//
// Lógica pura (inventario + cambios → inventario') → testeable sin red.

import type { InventarioPE, MovimientoPE, DraftMovCambio } from './types'

export interface MovApplyResult {
  inventario: InventarioPE
  aplicados: number
  noAplicados: number
  warnings: string[]
}

const BANDAS = new Set(['baja', 'media', 'alta'])
const TIPOS_DEP = new Set(['fs', 'ff', 'continuo', 'sugerida'])

export function aplicarMovCambios(
  inventarioOriginal: InventarioPE | undefined,
  cambios: DraftMovCambio[],
): MovApplyResult {
  const inventario: InventarioPE = JSON.parse(JSON.stringify(inventarioOriginal ?? { movimientos: [], resumenes_categoria: [], generado_en: '' }))
  const movs = inventario.movimientos ?? []
  const byId = new Map(movs.map(m => [m.id, m]))
  const warnings: string[] = []
  let aplicados = 0, noAplicados = 0

  for (const ch of cambios) {
    const mov = byId.get(ch.mov_id)
    if (!mov) { warnings.push(`${ch.id}: movimiento ${ch.mov_id} no existe. NO se aplicó.`); noAplicados++; continue }

    // ── Edición de campo escalar / texto ──
    if (ch.campo) {
      const ok = aplicarCampo(mov, ch)
      if (ok) aplicados++
      else { warnings.push(`${ch.id}: valor inválido para ${ch.campo} en ${ch.mov_id}. NO se aplicó.`); noAplicados++ }
      continue
    }

    // ── Edición de dependencia ──
    if (ch.dep) {
      const ok = aplicarDep(mov, ch, byId, warnings, ch.id)
      if (ok) aplicados++; else noAplicados++
      continue
    }

    warnings.push(`${ch.id}: cambio sin campo ni dependencia. NO se aplicó.`)
    noAplicados++
  }

  return { inventario, aplicados, noAplicados, warnings }
}

function aplicarCampo(mov: MovimientoPE, ch: DraftMovCambio): boolean {
  const v = ch.valor_nuevo
  switch (ch.campo) {
    case 'nombre': if (typeof v !== 'string' || !v.trim()) return false; mov.nombre = v.trim(); return true
    case 'descripcion': mov.descripcion = String(v ?? ''); return true
    case 'dueno': mov.dueno = String(v ?? ''); return true
    case 'criterio_exito': mov.criterio_exito = String(v ?? ''); return true
    case 'impacto': {
      const b = String(v ?? '').toLowerCase()
      if (!BANDAS.has(b)) return false
      mov.impacto = b as 'baja' | 'media' | 'alta'; return true
    }
    case 'costo_banda_ancha': {
      const b = String(v ?? '').toLowerCase()
      if (!BANDAS.has(b)) return false
      mov.costo_banda_ancha = b as 'baja' | 'media' | 'alta'; return true
    }
    case 'duracion_meses_ejecucion': {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10)
      if (!Number.isFinite(n) || n < 0) return false
      mov.duracion_meses_ejecucion = n; return true
    }
    case 'brechas_atacadas': {
      const arr = Array.isArray(v)
        ? v.map(String)
        : String(v ?? '').split(/\s*[|,]\s*/).filter(Boolean)
      mov.brechas_atacadas = arr; return true
    }
    default: return false
  }
}

function aplicarDep(
  mov: MovimientoPE,
  ch: DraftMovCambio,
  byId: Map<string, MovimientoPE>,
  warnings: string[],
  id: string,
): boolean {
  const dep = ch.dep!
  const desde = dep.desde
  if (!desde || desde === mov.id) { warnings.push(`${id}: dependencia inválida (vacía o auto-referencia).`); return false }
  const movDesde = byId.get(desde)
  if (!movDesde) { warnings.push(`${id}: la precondición ${desde} no existe.`); return false }

  mov.precondiciones = mov.precondiciones ?? []
  mov.precondiciones_tipo = mov.precondiciones_tipo ?? {}
  mov.precondiciones_lag_meses = mov.precondiciones_lag_meses ?? {}
  movDesde.desbloquea = movDesde.desbloquea ?? []

  const tipo = (dep.tipo && TIPOS_DEP.has(dep.tipo) ? dep.tipo : 'fs') as 'fs' | 'ff' | 'continuo' | 'sugerida'
  const lag = Math.max(0, dep.lag_meses ?? 0)

  if (dep.accion === 'quitar') {
    mov.precondiciones = mov.precondiciones.filter(p => p !== desde)
    delete mov.precondiciones_tipo[desde]
    delete mov.precondiciones_lag_meses[desde]
    movDesde.desbloquea = movDesde.desbloquea.filter(d => d !== mov.id)
    return true
  }
  // agregar / editar
  if (!mov.precondiciones.includes(desde)) mov.precondiciones.push(desde)
  mov.precondiciones_tipo[desde] = tipo
  if (lag > 0) mov.precondiciones_lag_meses[desde] = lag
  else delete mov.precondiciones_lag_meses[desde]
  if (!movDesde.desbloquea.includes(mov.id)) movDesde.desbloquea.push(mov.id)
  return true
}
