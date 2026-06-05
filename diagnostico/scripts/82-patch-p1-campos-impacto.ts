// Patchea plan.palancas.preguntas_principal[id="P-1"].campos_a_mostrar del
// Plan Sr: reemplaza 'banda_ancha' por 'impacto'. Aplica solo si P-1 no tiene
// respuesta todavía (no queremos tocar preguntas ya respondidas).
//
// Razón: el modelo emitió P-1 con banda_ancha (esfuerzo) en lugar de impacto.
// El criterio actualizado del wizard prioriza impacto como indicador visual
// principal. Cambio retroactivo sin re-emisión del modelo.

import { getPlanEstrategico, updatePlanEstrategico } from '@/lib/airtable'
import type { PlanoPE, CampoFichaMovimiento } from '@/lib/types'

const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'

async function main() {
  const plan = await getPlanEstrategico(PLAN_SR_ID)
  const palancas = plan.plan?.palancas
  if (!palancas) { console.log('❌ No hay palancas en este plan.'); process.exit(1) }

  const p1 = palancas.preguntas_principal.find(q => q.id === 'P-1')
  if (!p1) { console.log('❌ No hay P-1.'); process.exit(1) }

  if (p1.respuesta?.trim()) {
    console.log('⚠ P-1 ya tiene respuesta — no toco campos_a_mostrar para no romper la trazabilidad. Abortar.')
    process.exit(0)
  }

  const camposActuales = p1.campos_a_mostrar ?? []
  console.log(`[patch] campos_a_mostrar actuales: ${JSON.stringify(camposActuales)}`)

  if (!camposActuales.includes('banda_ancha')) {
    console.log('[patch] banda_ancha no está presente — nada que cambiar.')
    return
  }

  // Reemplazar banda_ancha por impacto. Si impacto ya está, solo eliminar banda_ancha.
  const camposNuevos: CampoFichaMovimiento[] = camposActuales
    .map(c => c === 'banda_ancha' ? 'impacto' : c)
    .filter((c, i, arr) => arr.indexOf(c) === i)  // dedupe por si impacto ya estaba

  console.log(`[patch] campos_a_mostrar nuevos:   ${JSON.stringify(camposNuevos)}`)

  const planActualizado: PlanoPE = {
    ...plan.plan,
    palancas: {
      ...palancas,
      preguntas_principal: palancas.preguntas_principal.map(q =>
        q.id === 'P-1' ? { ...q, campos_a_mostrar: camposNuevos } : q,
      ),
    },
  }

  await updatePlanEstrategico(PLAN_SR_ID, { plan: planActualizado })
  console.log('[patch] ✓ Persistido.')
}

main().catch(e => { console.error('[patch] FATAL:', e); process.exit(1) })
