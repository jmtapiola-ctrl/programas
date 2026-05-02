// Fase 3 paso 4: persistir el PANEL_UPDATE consolidado aprobado en el Plan Sr
// de Terravinci usando el pipeline fixeado (Fase 1+2). Es el primer test
// integral end-to-end del fix.
//
// Flow (mismo que el endpoint /chat tras un turno con panelUpdate válido):
//   1. Cargar plan + entrevista actuales
//   2. Cargar el JSON aprobado de 21-panel-consolidado.json
//   3. Aplicar mergeProposito + mergeSituacion + mergeDatosFaltantes (loggea events)
//   4. updatePlanEstrategico con los merges
//   5. updateEntrevistaPE con paso=2, sub_bloque=2.G, contadores reseteados,
//      ultimo_panel_update_ok=ahora
//   6. Re-leer el plan y reportar el estado final

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
  updateEntrevistaPE,
} from '@/lib/airtable'
import {
  mergeProposito,
  mergeSituacion,
  mergeDatosFaltantes,
  mergePasoActual,
} from '@/lib/pe-panel-update'
import type { PanelUpdatePE } from '@/lib/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const TARGET_PLAN_ID = 'recFMWxoE5gTQQrf7'

async function main() {
  console.log('═'.repeat(72))
  console.log('FASE 3 PASO 4 — Persistir PANEL_UPDATE consolidado')
  console.log('═'.repeat(72))

  // 1. Cargar plan + entrevista actuales
  const plan = await getPlanEstrategico(TARGET_PLAN_ID)
  const entrevista = await getEntrevistaPE(TARGET_PLAN_ID)
  if (!entrevista) throw new Error('Entrevista no encontrada')
  console.log(`Plan: ${plan.nombre}`)
  console.log(`Estado actual antes de persistir:`)
  console.log(`  proposito.escena: ${plan.proposito?.escena?.length ?? 0} chars`)
  console.log(`  proposito.metricas: ${plan.proposito?.metricas?.length ?? 0} items`)
  console.log(`  proposito.fuera: ${plan.proposito?.fuera?.length ?? 0} items`)
  console.log(`  situacion.desvio_principal: ${plan.situacion?.desvio_principal?.length ?? 0} chars`)
  console.log(`  situacion.causa_raiz: ${plan.situacion?.causa_raiz?.length ?? 0} chars`)
  console.log(`  datos_faltantes: ${plan.datos_faltantes?.length ?? 0} items`)
  console.log(`  paso_actual entrevista: ${entrevista.paso_actual}`)
  console.log(`  sub_bloque entrevista: ${entrevista.sub_bloque_actual}`)
  console.log()

  // 2. Cargar el JSON aprobado
  const consolidado = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'output', '21-panel-consolidado.json'), 'utf8')
  )
  if (!consolidado.parse_result?.ok) {
    throw new Error('El JSON regenerado NO es válido (parse_result.ok=false). Abortando.')
  }
  const panelUpdate: PanelUpdatePE = consolidado.parse_result.data
  console.log(`JSON aprobado cargado: paso=${panelUpdate.paso_actual} sub=${panelUpdate.sub_bloque_actual}`)
  console.log()

  // 3. Aplicar merges (con logging de events)
  console.log('Aplicando merges:')
  const propMerge = mergeProposito(plan.proposito, panelUpdate.proposito)
  const sitMerge = mergeSituacion(plan.situacion, panelUpdate.situacion)
  const datosMerge = mergeDatosFaltantes(plan.datos_faltantes, panelUpdate.datos_faltantes)

  const allEvents = [...propMerge.events, ...sitMerge.events, ...datosMerge.events]
  const updated = allEvents.filter(e => e.type === 'updated')
  const preserved = allEvents.filter(e => e.type === 'preserved_empty')
  const shrinkages = allEvents.filter(e => e.type === 'preserved_shrinkage')

  console.log(`  updated:           ${updated.length}`)
  for (const e of updated) console.log(`    - ${e.field}`)
  console.log(`  preserved_empty:   ${preserved.length}`)
  for (const e of preserved) console.log(`    - ${e.field}`)
  console.log(`  preserved_shrinkage: ${shrinkages.length}  ${shrinkages.length > 0 ? '⚠ atención' : ''}`)
  for (const e of shrinkages) console.log(`    - ${e.field}: current=${(e as any).current_size} incoming=${(e as any).incoming_size}`)

  // 4. updatePlanEstrategico
  console.log()
  console.log('Persistiendo en Airtable...')
  await updatePlanEstrategico(TARGET_PLAN_ID, {
    proposito: propMerge.value,
    situacion: sitMerge.value,
    datos_faltantes: datosMerge.value,
    horizonte: propMerge.value.horizonte,
  })
  console.log('  ✔ updatePlanEstrategico')

  // 5. updateEntrevistaPE — actualizar metadata + tracking de salud
  await updateEntrevistaPE(entrevista.id, {
    paso_actual: mergePasoActual(entrevista.paso_actual, panelUpdate.paso_actual),
    sub_bloque_actual: panelUpdate.sub_bloque_actual,
    ultimo_panel_update_ok: new Date().toISOString(),
    turnos_sin_panel_consecutivos: 0,
    // retries_panel_update_acumulados se mantiene (no es un retry, es una curación)
  })
  console.log('  ✔ updateEntrevistaPE')

  // 6. Verificar leyendo de nuevo
  console.log()
  console.log('Verificación post-persist:')
  const planAfter = await getPlanEstrategico(TARGET_PLAN_ID)
  const entrevAfter = await getEntrevistaPE(TARGET_PLAN_ID)
  console.log(`  proposito.escena:               ${planAfter.proposito?.escena?.length ?? 0} chars  (esperado >1000)`)
  console.log(`  proposito.metricas:             ${planAfter.proposito?.metricas?.length ?? 0} items  (esperado 7)`)
  console.log(`  proposito.fuera:                ${planAfter.proposito?.fuera?.length ?? 0} items  (esperado 9)`)
  console.log(`  proposito.estabilidad:          ${planAfter.proposito?.estabilidad?.length ?? 0} chars  (esperado >100)`)
  console.log(`  situacion.desvio_principal:     ${planAfter.situacion?.desvio_principal?.length ?? 0} chars  (esperado >100)`)
  console.log(`  situacion.desvio_cuantificado:  ${planAfter.situacion?.desvio_cuantificado?.length ?? 0} chars`)
  console.log(`  situacion.desvios_secundarios:  ${planAfter.situacion?.desvios_secundarios?.length ?? 0} items  (esperado 3)`)
  console.log(`  situacion.causa_raiz:           ${planAfter.situacion?.causa_raiz?.length ?? 0} chars  (esperado >500)`)
  console.log(`  situacion.consecuencia_6m:      ${planAfter.situacion?.consecuencia_6m?.length ?? 0} chars`)
  console.log(`  situacion.consecuencia_12m:     ${planAfter.situacion?.consecuencia_12m?.length ?? 0} chars`)
  console.log(`  situacion.recursos_actuales:    ${planAfter.situacion?.recursos_actuales?.length ?? 0} chars`)
  console.log(`  situacion.recursos_faltantes:   ${planAfter.situacion?.recursos_faltantes?.length ?? 0} chars`)
  console.log(`  situacion.intentos_previos:     ${planAfter.situacion?.intentos_previos?.length ?? 0} chars`)
  console.log(`  situacion.resistencias:         ${planAfter.situacion?.resistencias?.length ?? 0} items  (esperado 6)`)
  console.log(`  datos_faltantes:                ${planAfter.datos_faltantes?.length ?? 0} items  (esperado 10)`)
  console.log()
  console.log(`  entrevista.paso_actual:         ${entrevAfter?.paso_actual}  (esperado 2)`)
  console.log(`  entrevista.sub_bloque_actual:   "${entrevAfter?.sub_bloque_actual}"  (esperado "2.G")`)
  console.log(`  entrevista.ultimo_panel_update_ok: ${entrevAfter?.ultimo_panel_update_ok}`)
  console.log(`  entrevista.turnos_sin_panel_consecutivos: ${entrevAfter?.turnos_sin_panel_consecutivos}  (esperado 0)`)

  console.log()
  console.log('✔✔✔ PERSIST COMPLETADO')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
