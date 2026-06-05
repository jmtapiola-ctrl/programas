// Reconciliación bidireccional de precondiciones ↔ desbloquea en el inventario
// del Plan Sr. Repara inconsistencias del tipo:
//
//   M-A.desbloquea incluye M-B  PERO  M-B.precondiciones NO incluye M-A.
//   M-A.precondiciones incluye M-B  PERO  M-B.desbloquea NO incluye M-A.
//
// Estas inconsistencias pueden venir de generaciones del modelo donde declaró
// un lado y olvidó el otro. Desde el feature de auto-mirror (PATCH inventario/decision)
// quedan imposibles, pero los datos viejos requieren este pase.
//
// Side effect: si un mov tiene precondiciones pero tipo_dependencia='ninguna',
// se auto-corrige a 'blanda'. Si quedó vacío con tipo != 'ninguna', se baja a 'ninguna'.

import { getPlanEstrategico, updatePlanEstrategico } from '@/lib/airtable'
import type { MovimientoPE, PlanoPE } from '@/lib/types'

const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'
const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'

async function main() {
  if ((PLAN_SR_ID as string) === (PLAN_DUMMY_ID as string)) throw new Error('Sanity check')
  const plan = await getPlanEstrategico(PLAN_SR_ID)
  const inv = plan.plan?.inventario
  if (!inv) { console.log('❌ No hay inventario'); process.exit(1) }

  console.log(`[reconcile] Inventario: ${inv.movimientos.length} movs`)
  const byId = new Map(inv.movimientos.map(m => [m.id, m]))
  const cambios: string[] = []

  // Trabajamos sobre una copia mutable.
  let movs: MovimientoPE[] = inv.movimientos.map(m => ({
    ...m,
    precondiciones: [...(m.precondiciones ?? [])],
    desbloquea: [...(m.desbloquea ?? [])],
  }))

  for (const A of movs) {
    // A.desbloquea(B) requiere B.precondiciones(A)
    for (const Bid of A.desbloquea) {
      const B = movs.find(x => x.id === Bid)
      if (!B) {
        console.log(`  ⚠ ${A.id}.desbloquea referencia mov inexistente ${Bid} — limpio`)
        A.desbloquea = A.desbloquea.filter(x => x !== Bid)
        cambios.push(`${A.id}: quitado ${Bid} de desbloquea (mov inexistente)`)
        continue
      }
      if (!B.precondiciones.includes(A.id)) {
        B.precondiciones.push(A.id)
        cambios.push(`${B.id}: agregado ${A.id} a precondiciones (mirror de ${A.id}.desbloquea)`)
      }
    }
    // A.precondiciones(B) requiere B.desbloquea(A)
    for (const Bid of A.precondiciones) {
      const B = movs.find(x => x.id === Bid)
      if (!B) {
        console.log(`  ⚠ ${A.id}.precondiciones referencia mov inexistente ${Bid} — limpio`)
        A.precondiciones = A.precondiciones.filter(x => x !== Bid)
        cambios.push(`${A.id}: quitado ${Bid} de precondiciones (mov inexistente)`)
        continue
      }
      if (!B.desbloquea.includes(A.id)) {
        B.desbloquea.push(A.id)
        cambios.push(`${B.id}: agregado ${A.id} a desbloquea (mirror de ${A.id}.precondiciones)`)
      }
    }
  }

  // Auto-defaults de tipo_dependencia.
  movs = movs.map(m => {
    const tienePrecond = m.precondiciones.length > 0
    if (tienePrecond && m.tipo_dependencia === 'ninguna') {
      cambios.push(`${m.id}: tipo_dependencia 'ninguna' → 'sugerida' (auto-default: tiene ${m.precondiciones.length} precondiciones)`)
      return { ...m, tipo_dependencia: 'sugerida' as const }
    }
    if (!tienePrecond && m.tipo_dependencia !== 'ninguna') {
      cambios.push(`${m.id}: tipo_dependencia '${m.tipo_dependencia}' → 'ninguna' (sin precondiciones)`)
      return { ...m, tipo_dependencia: 'ninguna' as const }
    }
    return m
  })

  if (cambios.length === 0) {
    console.log('[reconcile] ✓ Inventario ya consistente. No-op.')
    return
  }

  console.log(`\n[reconcile] Cambios a aplicar: ${cambios.length}`)
  for (const c of cambios) console.log(`  - ${c}`)

  const planActualizado: PlanoPE = {
    ...plan.plan,
    inventario: { ...inv, movimientos: movs },
  }
  await updatePlanEstrategico(PLAN_SR_ID, { plan: planActualizado })
  console.log(`\n[reconcile] ✓ Persistido. ${cambios.length} ajustes aplicados.`)
}

main().catch(e => { console.error('[reconcile] FATAL:', e); process.exit(1) })
