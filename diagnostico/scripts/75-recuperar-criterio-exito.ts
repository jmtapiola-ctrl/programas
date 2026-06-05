// Construye plan.plan.preparativos.criterio_exito desde proposito.metricas
// con un item por métrica + pleno = valor_objetivo + minimo="" + zona_fracaso="".
// Esto dispara el banner "Completar criterios →" en la UI.

import { getPlanEstrategico, updatePlanEstrategico } from '@/lib/airtable'
import type { PlanoPE, CriterioExitoMetricaPE } from '@/lib/types'

const PLAN_ID = 'recFMWxoE5gTQQrf7'
const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'

async function main() {
  if ((PLAN_ID as string) === (PLAN_DUMMY_ID as string)) throw new Error('Sanity check')

  const plan = await getPlanEstrategico(PLAN_ID)
  const metricas = plan.proposito?.metricas ?? []
  if (metricas.length === 0) { console.log('❌ No hay métricas en propósito'); process.exit(1) }

  console.log(`[recup] ${metricas.length} métricas en propósito:`)
  const por_metrica: CriterioExitoMetricaPE[] = metricas.map((m: any) => {
    const metrica = typeof m === 'string' ? m : m.metrica
    const pleno = typeof m === 'string' ? '' : (m.valor_objetivo || '')
    console.log(`  - ${metrica}`)
    console.log(`    pleno: ${pleno.slice(0, 100)}${pleno.length > 100 ? '…' : ''}`)
    return { metrica, pleno, minimo: '' }
  })

  const planExistente: PlanoPE = plan.plan ?? {}
  const prepExistente = planExistente.preparativos ?? {
    areas_afectadas: [],
    supuestos_exogenos: [],
    priorizacion_inicial: { desvio_elegido: '', razon: '' },
    criterio_exito: { por_metrica: [], zona_fracaso: '' },
  }

  // Si ya hay criterio_exito con minimos cargados, preservarlos.
  const criterioPrev = prepExistente.criterio_exito ?? { por_metrica: [], zona_fracaso: '' }
  for (const item of por_metrica) {
    const prev = criterioPrev.por_metrica?.find(p => p.metrica === item.metrica)
    if (prev?.minimo?.trim()) {
      item.minimo = prev.minimo
      console.log(`    ✓ preservado minimo previo de "${item.metrica}"`)
    }
  }

  const planActualizado: PlanoPE = {
    ...planExistente,
    preparativos: {
      ...prepExistente,
      criterio_exito: {
        por_metrica,
        zona_fracaso: criterioPrev.zona_fracaso || '',
      },
    },
  }

  await updatePlanEstrategico(PLAN_ID, { plan: planActualizado })
  console.log(`\n[recup] ✓ Persistido. Recargá la entrevista — debería aparecer el banner "Completar criterios →".`)
}

main().catch(e => { console.error('[recup] FATAL:', e); process.exit(1) })
