// Fast-forward del plan dummy hasta sub_bloque=3.E con contenido pre-cargado.
//
// Razón: el dummy es contexto técnico que Juan no domina. Generar contenido
// realista para 3.C (borrador) y 3.D (estrés) le obliga a responder al azar
// y agota su atención antes del punto crítico (3.E = cierre formal + audit).
// Este script preserva la realidad de 3.0/3.A/3.B (real del usuario), genera
// un borrador real vía Opus, y mockea las preguntas de estrés con contenido
// plausible tailored al inventario actual.
//
// Toca SOLO el dummy (recEsoKMENVQI8NUb). NUNCA el Plan Sr.
//
// Costo esperado: ~$0.50 USD (1 llamada a Opus para el borrador).
// Latencia esperada: 60-80s.
//
// Uso: npx tsx --env-file=.env.local diagnostico/scripts/52-fast-forward-dummy-to-3E.ts

import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
  updateEntrevistaPE,
} from '@/lib/airtable'
import {
  buildBorradorSystemPrompt,
  buildBorradorUserMessage,
  inyectarNombresMovimientos,
} from '@/lib/borrador-prompt'
import Anthropic from '@anthropic-ai/sdk'
import type { BorradorIteracionPE, EstresQAPE, PlanoPE } from '@/lib/types'

const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'
const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'
const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

// Preguntas de estrés mock tailored al dummy (basado en el inventario y respuestas
// reales del Plan Sr de Terravinci en 3.B). Cubren los 4 ángulos clásicos del
// 3.D: supuestos rotos, cascadas, atajos, solapamientos.
//
// Si el dummy cambia significativamente (movimientos diferentes, palancas con
// otra cadena crítica), revisar esto. Actualmente los IDs M-1/M-3/M-4/etc.
// reflejan el inventario del dummy actual.
function buildEstresMock(): EstresQAPE[] {
  return [
    {
      id: 'E-1',
      pregunta: 'El plan asume que Finanzas aprueba M-4 (Aprobación formal de presupuesto de contratación QA Lead + Performance Engineer) en Q1. La respuesta de P-3 marcó M-4 como el verdadero cuello político y reportaste rumores de escepticismo en Dirección. Si Dirección lo rechaza, ¿hay un path al mínimo aceptable (3/4 pantallas + 85% cobertura) sin contratación nueva, o el plan se cae?',
      respuesta: 'El plan se cae estructuralmente. Sin presupuesto no hay M-1 (Contratar QA Lead senior), y sin M-1 no se ejecuta M-7 (Diseñar protocolo de validación cross-browser) ni M-10 (Construir mocks deterministicos). Plan B real: V-3 — negociar timeline con cliente, postergar 3 pantallas a 2027, validar solo 1 con recursos actuales. No es plan B "estratégico", es defensivo.',
      observacion_modelo: 'Confirmás que el path mínimo requiere SÍ O SÍ M-4 aprobado. V-3 no es plan B real, es renuncia parcial al alcance. Eso refuerza que M-3 (Construir business case) tiene que ser excepcional, no rutinario.',
      ajuste_aplicado: {
        tipo: 'inventario',
        descripcion: 'Elevar prioridad de M-3 — debe incluir narrativa política, no solo costo, y sumar aliado de management como sponsor (anotado en datos_faltantes).',
      },
    },
    {
      id: 'E-2',
      pregunta: 'M-1 (Contratar QA Lead senior) es precondición de M-7 (Diseñar protocolo de validación cross-browser), M-10 (Construir mocks deterministicos) y M-2 (Contratar Performance Engineer) según el borrador. Si M-1 se atrasa 60 días (de febrero a abril), ¿cuántos movimientos caen en cascada? ¿Tenés plan B para esa situación?',
      respuesta: 'En cascada caen 4 movimientos directos: M-7, M-10, M-2, M-20 (ritual QA-Backend). Indirectamente M-12 (job CI unit tests) y M-15 (alertas Sentry) también dependen del QA Lead operativo. Plan B parcial: arrancar M-7 con Marian como interina (descartado en alternativas, pero reactivable). M-2 no se puede activar antes de M-1 — Performance Engineer necesita protocolo establecido.',
      observacion_modelo: 'Single-point-of-failure crítico: 6 movimientos cuelgan de M-1. Reactivar Marian como interina vía M-7 fue descartado por consenso pero queda como "rescate" si M-1 se atrasa >30d.',
      ajuste_aplicado: {
        tipo: 'borrador',
        descripcion: 'Agregar al criterio_exito.path_minimo: "Si M-1 se atrasa >30d, activar Marian como interina de M-7 hasta llegada del QA Lead nuevo".',
      },
    },
    {
      id: 'E-3',
      pregunta: 'M-15 (Configurar alertas en Sentry para errores de las 4 pantallas) y M-18 (Reescribir docs/testing-protocol.md con protocolo vigente) parecen reaseguro técnico. Si M-7 + M-10 + M-8 funcionan, ¿son necesarios o se pueden saltar/postergar?',
      respuesta: 'M-15 sí es necesario — sin alertas el equipo no se entera de regresiones en producción aunque los tests pasen en CI. M-18 puede postergarse a 2027 sin riesgo si M-7 documenta el protocolo en su propia entrega. Recomiendo: M-15 se mantiene en Q3, M-18 se mueve a "post-cierre Paso 3 o backlog del año siguiente".',
      observacion_modelo: 'Vos marcaste M-18 como riesgo de olvido en P-5. Coincide con tu propuesta acá de postergarlo conscientemente vs. dejarlo "para cuando se pueda".',
      ajuste_aplicado: {
        tipo: 'inventario',
        descripcion: 'Mover M-18 (Reescribir docs/testing-protocol.md) a categoría "Backlog 2027" o quitar del plan vigente. M-7 absorbe la documentación del protocolo.',
      },
    },
    {
      id: 'E-4',
      pregunta: 'M-20 (Establecer ritual semanal de QA-Backend para integrar sets de tests) lo marcaste en P-5 como alto riesgo de dilución cultural. El borrador lo incluye como ritualizado con dueño explícito desde febrero. ¿Hay un atajo organizacional? ¿Carlos Gómez + el QA Lead nuevo firman un commit explícito de integración trimestral en lugar de semanal — menor cadencia pero más sostenible?',
      respuesta: 'Sí, atajo viable. Ritual semanal después de 4-6 semanas se diluye en mi experiencia. Mejor: integración trimestral formal (Q1, Q2, Q3, Q4) con agenda fija + entregable obligatorio (sets de tests integrados) + sponsor de management (Romi como dirección de Desarrollo). Mantiene presión sin agotar.',
      observacion_modelo: 'Buen ajuste. Trimestral con sponsor convierte el ritual de hábito blando a compromiso medible. Lo aplico en el borrador.',
      ajuste_aplicado: {
        tipo: 'inventario',
        descripcion: 'M-20: cambiar cadencia de "semanal" a "trimestral con entregable + sponsor de management (Romi)". Ajustar criterio_exito de M-20 a "4 integraciones trimestrales completadas con sets de tests entregados".',
      },
    },
    {
      id: 'E-5',
      pregunta: 'M-7 (Diseñar protocolo de validación cross-browser) y M-10 (Construir mocks deterministicos para las 4 pantallas) parecen solaparse en la capa de validación. ¿Se podría hacer solo M-7 reforzado con mocks ad-hoc de la propia entrega de M-7, sin necesidad de M-10 como movimiento separado?',
      respuesta: 'No se solapan — son capas distintas. M-7 define QUÉ validar (criterios, secuencia de checks, formatos de bug). M-10 define CON QUÉ datos (mocks determinísticos que eliminan ambigüedad de cuándo un bug es real vs flaky). Si fusionamos, M-7 se vuelve "protocolo + datos" y se infla a 4 meses en lugar de 6 semanas. Mantener separados.',
      observacion_modelo: 'Aclaración importante. La pregunta surge porque desde fuera parecen redundantes, pero internamente atacan dos fragilidades distintas (criterios borrosos vs datos flaky). Lo dejo separado.',
      // Sin ajuste — la respuesta confirma que la separación es correcta.
    },
  ]
}

async function main() {
  if ((PLAN_DUMMY_ID as string) === (PLAN_SR_ID as string)) {
    throw new Error('Sanity check: PLAN_DUMMY_ID y PLAN_SR_ID coinciden — abort.')
  }
  console.log(`[fast-forward → 3.E] Plan dummy: ${PLAN_DUMMY_ID}`)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const plan = await getPlanEstrategico(PLAN_DUMMY_ID)
  console.log(`[fast-forward → 3.E] Plan "${plan.nombre}" cargado.`)

  // Validaciones de estado
  const principal = plan.plan?.palancas?.preguntas_principal ?? []
  const principalRespondidas = principal.filter(q => q.respuesta?.trim()).length
  if (principal.length < 5 || principalRespondidas < 5) {
    throw new Error(`Pre-check falló: necesito 5 palancas_principal con respuesta. Estado: ${principalRespondidas}/${principal.length}.`)
  }
  const movsActivos = (plan.plan?.inventario?.movimientos ?? []).filter(m => m.estado_usuario !== 'quitado')
  console.log(`[fast-forward → 3.E] Pre-check OK:`)
  console.log(`  - ${movsActivos.length} movimientos activos en inventario`)
  console.log(`  - ${principalRespondidas}/5 palancas principal respondidas`)
  console.log(`  - ${plan.plan?.palancas?.preguntas_validador?.length ?? 0} palancas validador respondidas`)

  // ─── PASO 1: generar borrador vía Opus ─────────────────────────────────────
  console.log(`\n[fast-forward → 3.E] PASO 1: generando borrador (iteración 1) vía Opus...`)
  const systemPrompt = buildBorradorSystemPrompt()
  const userMessage = buildBorradorUserMessage(plan, 1, undefined, undefined)

  const start = Date.now()
  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 24000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })
  const finalMsg = await stream.finalMessage()
  const latenciaMs = Date.now() - start
  const inputTokens = finalMsg.usage.input_tokens
  const outputTokens = finalMsg.usage.output_tokens
  const costoUsd = (inputTokens * OPUS_INPUT_PER_M + outputTokens * OPUS_OUTPUT_PER_M) / 1_000_000

  const text = finalMsg.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  console.log(`[fast-forward → 3.E] Opus OK en ${(latenciaMs / 1000).toFixed(1)}s · costo=$${costoUsd.toFixed(3)}`)

  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) { try { parsed = JSON.parse(m[0]) } catch { /* fall-through */ } }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Opus output no parseable como JSON object.')
  }

  const iteracionRaw: BorradorIteracionPE = {
    numero: 1,
    contexto: typeof parsed.contexto === 'string' ? parsed.contexto : '',
    decisiones_priorizacion: Array.isArray(parsed.decisiones_priorizacion) ? parsed.decisiones_priorizacion : [],
    secuencia_movimientos: Array.isArray(parsed.secuencia_movimientos) ? parsed.secuencia_movimientos : [],
    supuestos_criticos: Array.isArray(parsed.supuestos_criticos) ? parsed.supuestos_criticos : [],
    criterio_exito: parsed.criterio_exito ?? { pleno: '', minimo: '', path_minimo: '' },
    alternativas_descartadas: Array.isArray(parsed.alternativas_descartadas) ? parsed.alternativas_descartadas : [],
    disconformidades_usuario: [],
    costo_usd: costoUsd,
    latencia_ms: latenciaMs,
    generado_en: new Date().toISOString(),
  }
  const { iteracion: borradorIter, inyecciones } = inyectarNombresMovimientos(
    iteracionRaw,
    plan.plan?.inventario?.movimientos ?? [],
  )
  console.log(`[fast-forward → 3.E] Borrador procesado · ${borradorIter.secuencia_movimientos.length} fases · ${borradorIter.decisiones_priorizacion.length} decisiones · ${inyecciones} nombres inyectados.`)

  // ─── PASO 2: mockear plan.estres con 5 preguntas pre-cargadas ──────────────
  console.log(`\n[fast-forward → 3.E] PASO 2: mockeando plan.estres con 5 preguntas tailored al dummy...`)
  const estresPreguntas = buildEstresMock()
  console.log(`[fast-forward → 3.E] Estrés mockeado · ${estresPreguntas.length} preguntas · ${estresPreguntas.filter(q => q.ajuste_aplicado).length} con ajuste_aplicado.`)

  // ─── PASO 3: persistir todo ────────────────────────────────────────────────
  // Limpiamos plan.curado explícitamente — si un test anterior persistió un
  // curado, queremos partir limpios para que Juan pueda testear el flow
  // "Generar plan curado" desde cero.
  const { curado: _curadoVacio, ...resto } = plan.plan ?? {}
  const planActualizado: PlanoPE = {
    ...resto,
    borrador: {
      iteraciones: [borradorIter],
      iteracion_aceptada: 1,
    },
    estres: {
      preguntas: estresPreguntas,
    },
  }
  await updatePlanEstrategico(PLAN_DUMMY_ID, { plan: planActualizado })
  console.log(`[fast-forward → 3.E] Plan persistido — borrador.iteracion_aceptada=1 + estres con 5 preguntas.`)

  const entrevista = await getEntrevistaPE(PLAN_DUMMY_ID)
  if (!entrevista) throw new Error('Entrevista no encontrada.')
  await updateEntrevistaPE(entrevista.id!, { sub_bloque_actual: '3.E', paso_actual: 3 })
  console.log(`[fast-forward → 3.E] Entrevista actualizada — sub_bloque_actual=3.E, paso_actual=3.`)

  // ─── REPORTE FINAL ─────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`✓ FAST-FORWARD COMPLETO — dummy listo en sub_bloque=3.E`)
  console.log(`${'═'.repeat(72)}`)
  console.log(`Estado final del dummy:`)
  console.log(`  · paso_actual: 3`)
  console.log(`  · sub_bloque_actual: 3.E`)
  console.log(`  · plan.preparativos: ${plan.plan?.preparativos ? 'preservado' : '(vacío)'}`)
  console.log(`  · plan.inventario: ${movsActivos.length} movimientos activos preservados`)
  console.log(`  · plan.palancas: 5 principal + ${plan.plan?.palancas?.preguntas_validador?.length ?? 0} validador preservados`)
  console.log(`  · plan.borrador: 1 iteración aceptada (recién generada por Opus, $${costoUsd.toFixed(2)})`)
  console.log(`  · plan.estres: 5 preguntas mockeadas con respuestas + ${estresPreguntas.filter(q => q.ajuste_aplicado).length} ajustes registrados`)
  console.log(`  · plan.curado: vacío (a generar en 3.E)`)
  console.log(`\nCosto total: $${costoUsd.toFixed(3)} USD. Latencia total: ${(latenciaMs / 1000).toFixed(1)}s.`)
}

main().catch(e => {
  console.error('[fast-forward → 3.E] FATAL:', e)
  process.exit(1)
})
