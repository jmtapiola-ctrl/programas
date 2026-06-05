// Cap del Plan Jr (Fase 6) — contraste FORMAL al cerrar el Paso 3.
//
// El cap tiene dos mitades:
//   1. DETERMINÍSTICA (este módulo): compara agregados del plan curado del Jr
//      (costo/duración totales) contra el baseline que el Sr estimó para esta
//      línea (movs_heredados_snapshot). Emite ReviewerQuestion cuando el plan
//      se desvía groseramente, y produce un CapAuditoriaJrSnapshot de trazas.
//   2. SEMÁNTICA (en el reviewer): "¿el plan curado entrega cada criterio de
//      éxito / métrica heredada?" — vive en reviewer-prompt.ts (opts.capJr) y
//      la corre el reviewer LLM, que emite ReviewerQuestion por cada shortfall.
//
// Decisión de diseño: las divergencias se canalizan como ReviewerQuestion (NO
// ReviewerError), porque audit-apply solo localiza/reescribe texto de
// proposito/situacion, no del curado. Las questions se resuelven con el dueño
// Jr vía Opus en /apply, sin tocar el localizador determinístico.

import type {
  PlanEstrategico,
  ReviewerQuestion,
  CapAuditoriaJrSnapshot,
  MovimientoPE,
} from './types'
import { getCuradoActivo } from './types'

// Suma costo (rango_max) y duración de un set de movimientos, deduplicando por id.
function agregados(movs: MovimientoPE[]): { costo: number; duracion: number; count: number } {
  const seen = new Set<string>()
  let costo = 0
  let duracion = 0
  for (const m of movs) {
    if (!m || seen.has(m.id)) continue
    seen.add(m.id)
    costo += m.costo_monetario?.rango_max_usd ?? 0
    duracion += m.duracion_meses_ejecucion ?? 0
  }
  return { costo, duracion, count: seen.size }
}

// Cuenta líneas no vacías (proxy de "cantidad de criterios/métricas heredados").
function contarLineas(md?: string): number {
  if (!md) return 0
  return md.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l !== '-').length
}

const UMBRAL_SOBRECOSTO = 1.3   // Jr > 130% del baseline Sr
const UMBRAL_SUBCOSTO = 0.7     // Jr < 70% del baseline Sr (posible shortfall de alcance)

export function generarDivergenciasCapJr(
  plan: PlanEstrategico,
  nowIso: string,
): { divergencias: ReviewerQuestion[]; capSnapshot: CapAuditoriaJrSnapshot } {
  const curado = getCuradoActivo(plan)
  const movsJr = curado
    ? curado.secuencia_movimientos.flatMap(f => f.movimientos ?? [])
    : []
  const baseline = plan.movs_heredados_snapshot ?? []

  const aggJr = agregados(movsJr)
  const aggSr = agregados(baseline)

  const divergencias: ReviewerQuestion[] = []

  // Divergencia de costo agregado (solo si hay baseline con costo > 0).
  if (aggSr.costo > 0) {
    const ratio = aggJr.costo / aggSr.costo
    if (ratio > UMBRAL_SOBRECOSTO) {
      divergencias.push({
        id: 'cap-costo-sobre',
        categoria: 'CRITICA',
        pregunta: `Tu plan suma ~USD ${Math.round(aggJr.costo).toLocaleString('en-US')} en costo, ${Math.round((ratio - 1) * 100)}% por encima de lo que el Sr estimó para esta línea (~USD ${Math.round(aggSr.costo).toLocaleString('en-US')}). ¿Cómo justificás el sobrecosto, o qué ajustás para acercarte al presupuesto del Sr?`,
        por_que_importa: 'El Sr dimensionó la línea con un presupuesto implícito. Un sobrecosto grande sin justificación puede romper la viabilidad del plan superior.',
        relacion_con_plan: 'Costo total del plan curado vs baseline heredado del Sr.',
        placeholder_ejemplo_respuesta: 'El sobrecosto viene de X; lo justifico porque… / Recorto los movimientos Y y Z para volver al rango.',
      })
    } else if (ratio < UMBRAL_SUBCOSTO) {
      divergencias.push({
        id: 'cap-costo-bajo',
        categoria: 'RECOMENDADA',
        pregunta: `Tu plan suma ~USD ${Math.round(aggJr.costo).toLocaleString('en-US')} en costo, bastante por debajo de lo que el Sr estimó (~USD ${Math.round(aggSr.costo).toLocaleString('en-US')}). ¿Estás cubriendo todo el alcance que el Sr esperaba para esta línea, o estás dejando algo afuera?`,
        por_que_importa: 'Un costo muy por debajo del baseline puede indicar que el plan del Jr no cubre todo el alcance que el Sr le asignó (shortfall encubierto).',
        relacion_con_plan: 'Costo total del plan curado vs baseline heredado del Sr.',
        placeholder_ejemplo_respuesta: 'Cubro todo el alcance pero más barato porque… / Efectivamente dejo afuera X, lo cual está OK porque…',
      })
    }
  }

  // Divergencia de cobertura de movimientos (el Jr planifica muchos menos que el baseline).
  if (aggSr.count >= 3 && aggJr.count > 0 && aggJr.count < aggSr.count * 0.6) {
    divergencias.push({
      id: 'cap-cobertura',
      categoria: 'CRITICA',
      pregunta: `El Sr estimó ${aggSr.count} movimientos para esta línea y tu plan curado tiene ${aggJr.count}. ¿Estás seguro de que con menos movimientos llegás a los criterios de éxito heredados, o falta cubrir frentes?`,
      por_que_importa: 'Una cobertura mucho menor a la estimada por el Sr suele significar que algún criterio heredado no está siendo atacado.',
      relacion_con_plan: 'Cantidad de movimientos del plan curado vs baseline heredado.',
      placeholder_ejemplo_respuesta: 'Consolidé varios movimientos del Sr en menos, más potentes, porque… / Falta cubrir X, lo agrego.',
    })
  }

  const capSnapshot: CapAuditoriaJrSnapshot = {
    generado_en: nowIso,
    costo_total_jr_usd: aggJr.costo,
    costo_baseline_sr_usd: aggSr.costo,
    duracion_total_jr_meses: aggJr.duracion,
    duracion_baseline_sr_meses: aggSr.duracion,
    criterios_evaluados:
      contarLineas(plan.contexto_curado?.criterios_exito) +
      contarLineas(plan.contexto_curado?.metricas),
    divergencias_detectadas: divergencias.length,
  }

  return { divergencias, capSnapshot }
}
