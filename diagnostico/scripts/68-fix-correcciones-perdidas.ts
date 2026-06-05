// Surgical fix: aplicar las 2 correcciones que se perdieron porque el modelo
// omitió el PANEL_UPDATE en el turno del 2026-05-11T22:18:21Z.
//
// Correcciones:
//   1) proposito.metricas[Expansión geográfica].valor_objetivo
//      ANTES: "Operando en 2+ partidos nuevos del GBA hacia fin de 2026."
//      AHORA: "Operando en todas las macrozonas de CABA y opcionalmente en partidos nuevos del GBA hacia fin de 2026."
//   2) proposito.metricas[PAI graduado y escalado].valor_actual
//      ANTES: "100 ventas/mes en piloto Liniers, churn 50% no validado"
//      AHORA: "60 ventas/mes en piloto Liniers, churn 50% no validado"

import { getPlanEstrategico, updatePlanEstrategico } from '@/lib/airtable'

const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'
const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'

async function main() {
  if ((PLAN_SR_ID as string) === (PLAN_DUMMY_ID as string)) {
    throw new Error('Sanity check: PLAN_SR_ID === PLAN_DUMMY_ID')
  }

  const plan = await getPlanEstrategico(PLAN_SR_ID)
  if (!plan.proposito) throw new Error('plan.proposito vacío')

  const metricas = plan.proposito.metricas ?? []
  console.log(`[fix] Métricas actuales: ${metricas.length}`)

  let cambios = 0
  const nuevasMetricas = metricas.map((m: any) => {
    if (typeof m === 'string') return m

    // Corrección 1: Expansión geográfica
    if (m.metrica === 'Expansión geográfica') {
      if (m.valor_objetivo === 'Operando en 2+ partidos nuevos del GBA hacia fin de 2026.') {
        console.log(`  ✓ Corrección 1: Expansión geográfica.valor_objetivo`)
        console.log(`    ANTES: ${m.valor_objetivo}`)
        const nuevo = 'Operando en todas las macrozonas de CABA y opcionalmente en partidos nuevos del GBA hacia fin de 2026.'
        console.log(`    AHORA: ${nuevo}`)
        cambios++
        return { ...m, valor_objetivo: nuevo }
      } else {
        console.log(`  ⚠ Expansión geográfica.valor_objetivo no matchea el texto ANTES esperado.`)
        console.log(`    actual: "${m.valor_objetivo}"`)
        return m
      }
    }

    // Corrección 2: PAI graduado y escalado
    if (m.metrica === 'PAI graduado y escalado') {
      if (m.valor_actual === '100 ventas/mes en piloto Liniers, churn 50% no validado') {
        console.log(`  ✓ Corrección 2: PAI graduado y escalado.valor_actual`)
        console.log(`    ANTES: ${m.valor_actual}`)
        const nuevo = '60 ventas/mes en piloto Liniers, churn 50% no validado'
        console.log(`    AHORA: ${nuevo}`)
        cambios++
        return { ...m, valor_actual: nuevo }
      } else {
        console.log(`  ⚠ PAI.valor_actual no matchea el texto ANTES esperado.`)
        console.log(`    actual: "${m.valor_actual}"`)
        return m
      }
    }

    return m
  })

  if (cambios === 0) {
    console.log(`\n[fix] ⚠ No se aplicó ningún cambio. Revisar si los textos ANTES esperados cambiaron desde el último read.`)
    process.exit(1)
  }

  const propositoActualizado = {
    ...plan.proposito,
    metricas: nuevasMetricas,
  }

  await updatePlanEstrategico(PLAN_SR_ID, { proposito: propositoActualizado })
  console.log(`\n[fix] ✓ Persistido en Airtable: ${cambios} corrección(es).`)
}

main().catch(e => { console.error('[fix] FATAL:', e); process.exit(1) })
