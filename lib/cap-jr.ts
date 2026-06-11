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
import { computeSchedule } from './computeSchedule'

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

// Diferencia en meses entre dos "YYYY-MM" (b - a). Positivo si b es posterior.
function mesesEntre(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by * 12 + bm) - (ay * 12 + am)
}

// Span del Sr (baseline) desde las ventanas CONGELADAS al desplegar
// (ver lib/sr-expectativas.ts). arranca = min, termina = max, span en meses.
function spanDesdeVentanas(movs: MovimientoPE[]): { arranca: string | null; termina: string | null; spanMeses: number } {
  let min: string | null = null, max: string | null = null
  for (const m of movs) {
    const v = m?.ventana_temporal
    if (!v) continue
    if (/^\d{4}-\d{2}$/.test(v.arranca) && (min === null || v.arranca < min)) min = v.arranca
    if (/^\d{4}-\d{2}$/.test(v.termina) && (max === null || v.termina > max)) max = v.termina
  }
  return { arranca: min, termina: max, spanMeses: min && max ? mesesEntre(min, max) : 0 }
}

// Span del Jr recomputando el CPM en vivo (las ventanas del Jr NO se persisten;
// se derivan de duraciones + dependencias). Devuelve cierre/arranque/span.
function spanDesdeCPM(movs: MovimientoPE[], baseDate: Date): { arranca: string | null; termina: string | null; spanMeses: number } {
  const sched = computeSchedule(movs.filter(m => m.estado_usuario !== 'quitado'), baseDate)
  let min: string | null = null, max: string | null = null
  for (const s of sched.values()) {
    if (min === null || s.arrancaYM < min) min = s.arrancaYM
    if (max === null || s.terminaYM > max) max = s.terminaYM
  }
  return { arranca: min, termina: max, spanMeses: min && max ? mesesEntre(min, max) : 0 }
}

const UMBRAL_SOBRECOSTO = 1.3      // Jr > 130% del baseline Sr
const UMBRAL_SUBCOSTO = 0.7        // Jr < 70% del baseline Sr (posible shortfall de alcance)
const UMBRAL_ATRASO_MESES = 2      // Jr cierra ≥2 meses después de lo que el Sr esperaba
const UMBRAL_EXPANSION_SPAN = 2.5  // Jr span ≥ 2.5× el span que el Sr presupuestó
const UMBRAL_EXPANSION_MESES = 2   // …y al menos 2 meses más largo en absoluto

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
        pregunta: `Tu plan suma ~USD ${Math.round(aggJr.costo).toLocaleString('en-US')} en costo, ${Math.round((ratio - 1) * 100)}% por encima de lo que el Sr estimó para este plan (~USD ${Math.round(aggSr.costo).toLocaleString('en-US')}). ¿Cómo justificás el sobrecosto, o qué ajustás para acercarte al presupuesto del Sr?`,
        por_que_importa: 'El Sr dimensionó el plan con un presupuesto implícito. Un sobrecosto grande sin justificación puede romper la viabilidad del plan superior.',
        relacion_con_plan: 'Costo total del plan curado vs baseline heredado del Sr.',
        placeholder_ejemplo_respuesta: 'El sobrecosto viene de X; lo justifico porque… / Recorto los movimientos Y y Z para volver al rango.',
      })
    } else if (ratio < UMBRAL_SUBCOSTO) {
      divergencias.push({
        id: 'cap-costo-bajo',
        categoria: 'RECOMENDADA',
        pregunta: `Tu plan suma ~USD ${Math.round(aggJr.costo).toLocaleString('en-US')} en costo, bastante por debajo de lo que el Sr estimó (~USD ${Math.round(aggSr.costo).toLocaleString('en-US')}). ¿Estás cubriendo todo el alcance que el Sr esperaba para este plan, o estás dejando algo afuera?`,
        por_que_importa: 'Un costo muy por debajo del baseline puede indicar que el plan del Jr no cubre todo el alcance que el Sr le asignó (shortfall encubierto).',
        relacion_con_plan: 'Costo total del plan curado vs baseline heredado del Sr.',
        placeholder_ejemplo_respuesta: 'Cubro todo el alcance pero más barato porque… / Efectivamente dejo afuera X, lo cual está OK porque…',
      })
    }
  }

  // Cronograma del Jr: se recomputa por CPM (las ventanas del Jr no se persisten).
  // Baseline del Sr: se lee de las ventanas CONGELADAS al desplegar (CPM real del Sr
  // completo — ver lib/sr-expectativas.ts). Antes ambos leían ventana_temporal vacío
  // → el chequeo se salteaba siempre. Ese era el bug central.
  // baseDate del CPM del Jr = "ahora" (el plan arranca hoy). Derivado de nowIso
  // para que el cap sea determinístico/testeable.
  const baseDate = (() => { const d = new Date(nowIso); return isNaN(d.getTime()) ? new Date() : d })()
  const jrSpan = spanDesdeCPM(plan.plan?.inventario?.movimientos ?? [], baseDate)
  const srSpan = spanDesdeVentanas(baseline)
  const cierreJr = jrSpan.termina
  const cierreSr = srSpan.termina
  // Rol crítico del baseline: ¿alguno de los movs heredados es prerequisite del
  // resto del Sr? (sr_desbloquea_total congelado al desplegar).
  const maxDesbloquea = baseline.reduce((mx, m) => Math.max(mx, m.sr_desbloquea_total ?? 0), 0)
  const algunPrerequisite = maxDesbloquea > 0

  // ── TEMPORAL: el Jr cierra después de lo que el Sr necesita ──
  if (cierreJr && cierreSr) {
    const atrasoMeses = mesesEntre(cierreSr, cierreJr)
    if (atrasoMeses >= UMBRAL_ATRASO_MESES) {
      const rolMd = algunPrerequisite
        ? ` Además, lo que heredaste es un HABILITADOR del Sr (desbloquea ${maxDesbloquea} movimiento${maxDesbloquea === 1 ? '' : 's'} aguas abajo), así que ese atraso no queda contenido: empuja al resto del Plan Sr.`
        : ''
      divergencias.push({
        id: 'cap-tiempo-atraso',
        categoria: 'CRITICA',
        pregunta: `Tu cronograma cierra este plan en ${cierreJr}, ${atrasoMeses} ${atrasoMeses === 1 ? 'mes' : 'meses'} después de lo que el Sr esperaba (${cierreSr}).${rolMd} ¿Cómo lo resolvés — replanificás la secuencia, recortás duraciones, o acotás alcance?`,
        por_que_importa: 'El horizonte/ventana de este plan es un DADO heredado del Sr, no una elección del Jr. Un atraso en un plan prerequisite se amplifica aguas abajo y puede anular el cronograma del Plan Sr.',
        relacion_con_plan: 'Cierre del cronograma del Jr (CPM) vs cierre que el Sr esperaba (CPM del Sr congelado al desplegar).',
        placeholder_ejemplo_respuesta: 'Adelanto X poniéndolo en paralelo / Recorto la duración de M-Y / Acepto el atraso porque el Sr tiene holgura en este plan, lo confirmo.',
      })
    }
  }

  // ── MAGNITUD / EXPANSIÓN: el Sr presupuestó un enabler corto y el Jr lo volvió
  // un programa largo. Compara el span (arranca→termina) del Sr vs el del Jr. ──
  if (srSpan.spanMeses > 0 && jrSpan.spanMeses > 0) {
    const ratio = jrSpan.spanMeses / srSpan.spanMeses
    const extra = jrSpan.spanMeses - srSpan.spanMeses
    if (ratio >= UMBRAL_EXPANSION_SPAN && extra >= UMBRAL_EXPANSION_MESES) {
      divergencias.push({
        id: 'cap-magnitud-expansion',
        categoria: 'RECOMENDADA',
        pregunta: `El Sr presupuestó este trabajo como algo de ~${srSpan.spanMeses} mes(es) de calendario (${srSpan.arranca}→${srSpan.termina}), y tu plan se extiende ~${jrSpan.spanMeses} meses (${jrSpan.arranca}→${jrSpan.termina}) — unas ${ratio.toFixed(1)}× más. ¿Es trabajo que el Sr no dimensionó (y hay que avisarle), o se puede comprimir/paralelizar para acercarse a lo que esperaba?`,
        por_que_importa: 'El Sr lo dimensionó como habilitador rápido para que el resto del plan arranque sobre cimientos claros. Convertirlo en un programa largo puede demorar todo aguas abajo aunque la fecha de cierre absoluta no parezca tardía.',
        relacion_con_plan: 'Span del cronograma del Jr vs span que el Sr presupuestó para los movimientos heredados.',
        placeholder_ejemplo_respuesta: 'El Sr subestimó: esto realmente lleva N meses, lo escalo a dirección / Paralelizo M-X y M-Y para bajar a N meses.',
      })
    }
  }

  // ── GATE DE CIERRE MÍNIMO: si lo heredado es prerequisite del Sr, exigir que el
  // Jr declare CUÁL de sus movimientos es el "cierre mínimo" que le entrega el
  // handoff al Sr, y para cuándo. Garantiza la alerta (no detecta un valor, fuerza
  // la declaración para que el dueño de aguas arriba sepa cuándo puede arrancar). ──
  if (algunPrerequisite && movsJr.length > 0) {
    divergencias.push({
      id: 'cap-gate-cierre-minimo',
      categoria: 'RECOMENDADA',
      pregunta: `Lo que heredaste es un habilitador del Sr (desbloquea ${maxDesbloquea} movimiento${maxDesbloquea === 1 ? '' : 's'} aguas abajo${cierreSr ? `, esperado para ${cierreSr}` : ''}). ¿Cuál de TUS movimientos es el "cierre mínimo" que le entrega ese handoff al Sr para que pueda arrancar lo de aguas abajo, y en qué fecha queda listo? (No hace falta tener todo tu plan terminado para habilitar al Sr.)`,
      por_que_importa: 'Sin un cierre mínimo declarado, el dueño del movimiento de aguas arriba no sabe cuándo puede empezar — puede esperar de más o arrancar sobre cimientos incompletos.',
      relacion_con_plan: 'Rol prerequisite de los movimientos heredados (congelado del Sr al desplegar).',
      placeholder_ejemplo_respuesta: 'Con M-1 + M-7 cerrados (jul-2026) el Sr ya tiene el handoff mínimo; el resto de mi plan corre en paralelo sin bloquearlo.',
    })
  }

  // Divergencia de cobertura de movimientos (el Jr planifica muchos menos que el baseline).
  if (aggSr.count >= 3 && aggJr.count > 0 && aggJr.count < aggSr.count * 0.6) {
    divergencias.push({
      id: 'cap-cobertura',
      categoria: 'CRITICA',
      pregunta: `El Sr estimó ${aggSr.count} movimientos para este plan y tu plan curado tiene ${aggJr.count}. ¿Estás seguro de que con menos movimientos llegás a los criterios de éxito heredados, o falta cubrir frentes?`,
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
    cierre_jr_ym: cierreJr ?? undefined,
    cierre_esperado_sr_ym: cierreSr ?? undefined,
  }

  return { divergencias, capSnapshot }
}
